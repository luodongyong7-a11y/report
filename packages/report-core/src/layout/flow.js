// report-core 流式分带布局引擎(方案 A):把模板拆成语义带,逐「逻辑行」量高、放下、游标下移、放不下换页。
// 框架无关、纯函数:度量后端可插拔(边车传 napi measureCell,设计器传 DOM offsetHeight 适配器),
// PDF / Excel / 前端预览消费同一份产物,彻底一致、零漂移。
//
// 分带严格对齐报表设计器的 4 条边界线(页眉线 headerY / 汇总A线 summaryA / 汇总B线 summaryB / 页脚线 footerY)划出的 5 个区:
//   页眉区 header          y < headerY               每页顶部重复(按设计 y 定位)
//   数据区 detail          headerY <= y < 汇总A       按数据展开;支持单表流式,以及 prevNodeId/groupId 多段级联(如变更前/后双表)
//   汇总区 summary         汇总A <= y < 汇总B         唯一的汇总区(汇总A线与汇总B线之间),每页都有,紧跟本页最后一条数据
//   汇总B到页脚区 sbf      汇总B <= y < footerY       与数据区同一套 groupId/prevNode 级联+自增高+可数组展开;
//                                                     唯一差别:每页重复,上移紧跟本页数据底;分页时预留其高度,保证与数据同页
//   页脚区 footer          y >= footerY              每页底部重复,钉页底(按设计 y 定位)
//
// 每个逻辑行都带「页内绝对 top」:数据区按单表游标或 prevNode 级联;
// 汇总/SBF = 本页数据底 +(设计 y - 设计数据区底边) 为自然原点(保留模板里相对数据底的间距/叠盒,如 1px 叠边);
// 页眉/页脚按设计 y。据此 PDF 直接按 top 逐行画(footer 自然钉页底),Excel 用占位行还原纵向间距。
//
// 列模型:由 detail 带元素 x/width 量化出列;其余带单元格按 x 吸附到这些列(colspan)。
// 行高:detail/sbf 文本 = 内容实测高,同 groupId+index 行内取最大高;其余固定带 = 簇内最大元素高。
// groupId=同行等高;prevNodeId=挂全部前驱中落位底边最大者+模板间距(见 groupPrev.js / topFromPrimaryPrev)。
// 聚合:sum(全局)/ subtotal(按页)/ page / total,复用 expressions,零漂移。
// 行合并:mergeMode first/sum/min 的列,按页内连续同组把 detail 单元格合并为 rowSpan(首行撑格,其余删除)。
import { expandElements as coreExpand } from './expand.js'
import { ensureGroupAndPrevNode } from './groupPrev.js'
import {
  extractPrimaryDatasetFromSumInner,
  evaluateReportAggregateExpression,
  addReportAggregate,
  applyTextFormat,
  sanitizeReportDisplayedText,
  parseReportDecimal,
  getRowField,
  rowItemFieldPathFromMergeSetting,
  getFirstPlaceholderToken,
  buildRowDisplayMap,
  Decimal
} from '../expressions.js'

const AXIS_TOL = 2               // 列边界吸附容差(px)
const ROW_CLUSTER_TOL = 8        // 页眉/汇总/汇总B到页脚/页脚 视觉行聚类的 y 间隔阈值(px)

function isMedia (t) { return t === 'image' || t === 'qrcode' || t === 'barcode' }

// ---- 列轴:边界取整、排序、容差去重;并提供「元素[x,x+w] → 1 基列跨 [colStart,colEnd]」映射 ----
function buildColumnAxis (edges) {
  const uniq = [...new Set(edges.map(v => Math.round(v)))].sort((a, b) => a - b)
  const bounds = []
  for (const v of uniq) {
    if (bounds.length === 0 || v - bounds[bounds.length - 1] > AXIS_TOL) bounds.push(v)
  }
  if (bounds.length < 2) bounds.push((bounds[0] || 0) + 1)

  const nearest = (val) => {
    const t = Math.round(val)
    let lo = 0; let hi = bounds.length - 1; let best = 0; let bestD = Infinity
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const d = Math.abs(bounds[mid] - t)
      if (d < bestD) { bestD = d; best = mid }
      if (bounds[mid] < t) lo = mid + 1
      else hi = mid - 1
    }
    return best
  }
  const count = bounds.length - 1
  const columns = []
  for (let i = 0; i < count; i++) columns.push({ x: bounds[i], width: bounds[i + 1] - bounds[i] })

  const spanOf = (x, w) => {
    const lo = bounds[0]; const hi = bounds[bounds.length - 1]
    const left = Math.max(lo, Math.min(hi, x))
    const right = Math.max(lo, Math.min(hi, x + w))
    let a = nearest(left) + 1
    let b = nearest(right)
    if (a < 1) a = 1
    if (b > count) b = count
    if (b < a) b = a
    return { colStart: a, colEnd: b }
  }
  const spanWidth = (a, b) => bounds[b] - bounds[a - 1]

  return { bounds, columns, count, spanOf, spanWidth }
}

// ---- 逻辑行的单元格 ----
function toCell (el, colAxis) {
  const o = el.original
  const { colStart, colEnd } = colAxis.spanOf(o.x || 0, o.width || 0)
  return {
    colStart,
    colEnd,
    rowSpan: 1,
    type: o.type,
    content: el.displayContent != null ? el.displayContent : el.parsedContent,
    // 单元格自身设计高度:页眉/汇总/页脚等视觉带按此渲染,不套用所在视觉行的最大高
    // (否则同一行里有高元素时,矮格会被撑高、盖住下一行,导致页眉信息区叠印)。
    ownHeight: (el.actualHeight != null ? el.actualHeight : (o.height || 0)),
    textAlign: o.textAlign,
    verticalAlign: o.verticalAlign,
    shrinkToFit: o.shrinkToFit === true,
    border: o.border,
    style: o.style,
    fill: el.previewRowHighlightBackground || (o.style && o.style.backgroundColor) || null,
    original: o,
    isMedia: isMedia(o.type),
    index: el.index,
    rowItem: el.rowItem,
    expressionPath: el.expressionPath,
    parsedContent: el.parsedContent
  }
}

// 页眉/汇总/汇总B到页脚/页脚:把单实例元素按视觉行(y 邻近)聚类成逻辑行,记录设计锚点 anchorY。
function clusterVisualRows (els, band, colAxis) {
  if (els.length === 0) return []
  const sorted = [...els].sort((a, b) => (a.original.y || 0) - (b.original.y || 0) || (a.original.x || 0) - (b.original.x || 0))
  const groups = []
  let cur = null
  let curTop = null
  for (const el of sorted) {
    const y = el.original.y || 0
    if (cur && y - curTop <= ROW_CLUSTER_TOL) cur.push(el)
    else { cur = [el]; curTop = y; groups.push(cur) }
  }
  return groups.map(group => {
    const cells = group.map(el => toCell(el, colAxis)).sort((a, b) => a.colStart - b.colStart)
    const anchorY = Math.min(...group.map(el => el.original.y || 0))
    const height = Math.max(...group.map(el => el.actualHeight || el.original.height || 0))
    return { band, anchorY, height, cells }
  })
}

// detail(单表回退):按 index(第几条数据)聚成逻辑行,行高 = 各单元格按设计宽实测的最大高。
// 仅用于数据区元素均无 prevNodeId 的模板;有 prevNodeId 时走 layoutDataPagesByPrevNode。
// measureCell(elementLike, { autoGrow }) => { boxHeight } 由调用方注入(napi / DOM)。
function buildDetailRows (dataEls, colAxis, measureCell) {
  const byIndex = new Map()
  for (const el of dataEls) {
    if (!byIndex.has(el.index)) byIndex.set(el.index, [])
    byIndex.get(el.index).push(el)
  }
  const indices = [...byIndex.keys()].sort((a, b) => a - b)
  const rows = []
  for (const idx of indices) {
    const els = byIndex.get(idx)
    const cells = []
    let height = 0
    for (const el of els) {
      const cell = toCell(el, colAxis)
      const o = el.original
      if (cell.isMedia) {
        height = Math.max(height, o.height || 0)
      } else {
        // 按模板设计宽度实测(PDF/HTML 亦按此宽渲染),不用列网格跨宽,保证测画一致、忠实模板。
        const m = measureCell({ ...o, parsedContent: cell.content }, { autoGrow: true })
        height = Math.max(height, m.boxHeight)
      }
      cells.push(cell)
    }
    cells.sort((a, b) => a.colStart - b.colStart)
    const borderW = Math.max(0, ...cells.map(c => (c.border && c.border.width) || 0))
    rows.push({ band: 'detail', height, cells, index: idx, rowItem: els[0] ? els[0].rowItem : null, borderW })
  }
  return rows
}

function usesPrevNode (els) {
  return els.some(el => el.original && el.original.prevNodeId)
}

// 同组同行(groupId + index)取最大实测高,保证表格行等高(对齐旧 paginate)。
function equalizeGroupHeights (dataEls) {
  const groupMap = new Map()
  for (const el of dataEls) {
    const groupId = el.original && el.original.groupId
    if (!groupId) continue
    const key = `${groupId}_${el.index}`
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key).push(el)
  }
  for (const els of groupMap.values()) {
    if (els.length < 2) continue
    const maxH = Math.max(...els.map(e => e.actualHeight || 0))
    for (const e of els) e.actualHeight = maxH
  }
}

// 解析 prevNodeId 列表(逗号分隔)。
function parsePrevNodeIds (prevNodeId) {
  if (!prevNodeId) return []
  return String(prevNodeId).split(',').map(s => s.trim()).filter(Boolean)
}

// index===0: 在全部 prevNodeId 已定位末实例中取「页码最大,同页则底边最大」者,
// 再挂其底边 + 模板设计间距(当前元素与该前驱的几何间距;负值=真实叠盒)。
// 不盲目用首位 ID:模板顺序可能过时,且多前驱展开后底边可能不等。
// 跨页时 top 是页内坐标,不能直接比数值;必须先比 pageIndex。
function topFromPrimaryPrev (el, lastById, fallbackTop) {
  const original = el.original
  const prevNodeIds = parsePrevNodeIds(original.prevNodeId)
  let maxBottomEl = null
  let maxPage = -Infinity
  let maxBottom = -Infinity
  for (const pid of prevNodeIds) {
    const prevEl = lastById.get(pid)
    if (!prevEl || prevEl.top == null) continue
    const page = prevEl.pageIndex ?? 0
    const bottom = prevEl.top + (prevEl.actualHeight || 0)
    if (page > maxPage || (page === maxPage && bottom > maxBottom)) {
      maxPage = page
      maxBottom = bottom
      maxBottomEl = prevEl
    }
  }
  if (!maxBottomEl) return { top: fallbackTop, pageIndex: undefined }
  const po = maxBottomEl.original
  const spacing = ((original.y || 0) - (po.y || 0) - (po.height || 0))
  return {
    top: maxBottomEl.top + (maxBottomEl.actualHeight || 0) + spacing,
    pageIndex: maxBottomEl.pageIndex ?? 0
  }
}

/** ds 展开多行(index>0):双边有框时扣边叠线,制造真实盒体重叠供绘制合并。 */
function dsExpandedBorderStack (prevOriginal, curOriginal) {
  const prevB = (prevOriginal && prevOriginal.border && prevOriginal.border.width) || 0
  const curB = (curOriginal && curOriginal.border && curOriginal.border.width) || 0
  return (prevB > 0 && curB > 0) ? prevB : 0
}

// 数据区多段级联:index===0 取 prevNodeId 中落位底边最大前驱+设计间距;index>0 为 ds 展开多行自动叠边。
function layoutDataPagesByPrevNode (dataEls, colAxis, headerY, cutoffY) {
  equalizeGroupHeights(dataEls)

  // originalId → 该模板元素当前已定位的最后实例(随遍历推进,即“末行”)
  const lastById = new Map()

  // 遍历顺序 = expand 产出顺序,保证读 prev 时前驱整段已定位完毕。
  for (const el of dataEls) {
    const original = el.original
    const index = el.index
    let top
    let pageIndex = 0

    if (index === 0) {
      const placed = topFromPrimaryPrev(el, lastById, original.y || headerY)
      top = placed.top
      if (placed.pageIndex != null) pageIndex = placed.pageIndex
    } else {
      const prevEl = lastById.get(original.id)
      if (prevEl && prevEl.top != null) {
        pageIndex = prevEl.pageIndex ?? 0
        const borderAdjustment = dsExpandedBorderStack(prevEl.original, original)
        top = prevEl.top + (prevEl.actualHeight || 0) - borderAdjustment
      } else {
        top = original.y || headerY
      }
    }

    if (typeof pageIndex !== 'number' || Number.isNaN(pageIndex)) pageIndex = 0

    const bottom = top + (el.actualHeight || 0)
    if (bottom > cutoffY) {
      pageIndex += 1
      top = headerY
    }

    el.top = top
    el.pageIndex = pageIndex
    lastById.set(original.id, el)
  }

  const pageIndices = [...new Set(dataEls.map(el => el.pageIndex))].sort((a, b) => a - b)
  if (pageIndices.length === 0) return [{ rows: [], dataBottom: headerY }]

  const dataPages = []
  for (const pi of pageIndices) {
    const pageEls = dataEls.filter(el => el.pageIndex === pi)
    const rowMap = new Map()
    for (const el of pageEls) {
      const gid = el.original.groupId
      const key = gid
        ? `${gid}_${el.index}`
        : `t:${Math.round(el.top)}_${el.original.id}_${el.index}`
      if (!rowMap.has(key)) rowMap.set(key, [])
      rowMap.get(key).push(el)
    }
    const rows = []
    for (const els of rowMap.values()) {
      const cells = els.map(e => toCell(e, colAxis)).sort((a, b) => a.colStart - b.colStart)
      const height = Math.max(...els.map(e => e.actualHeight || e.original.height || 0))
      const top = Math.min(...els.map(e => e.top))
      const borderW = Math.max(0, ...cells.map(c => (c.border && c.border.width) || 0))
      const seed = els.find(e => e.expressionPath) || els[0]
      rows.push({
        band: 'detail',
        top,
        height,
        cells,
        index: seed ? seed.index : 0,
        rowItem: seed ? seed.rowItem : null,
        borderW
      })
    }
    rows.sort((a, b) => a.top - b.top || a.index - b.index)
    const dataBottom = rows.length > 0
      ? Math.max(...rows.map(r => r.top + r.height))
      : headerY
    dataPages.push({ rows, dataBottom })
  }
  return dataPages
}

// 单表游标分页:detail 行自上而下累加,放不下换页。
// ds 多行双边有框时自动叠边(与 layoutDataPagesByPrevNode index>0 一致);不因贴合容差叠首行。
function paginateDetailRows (detailRows, headerY, cutoffY) {
  const dataPages = []
  let cursor = headerY
  let cur = []
  let prevBorderW = 0
  for (const row of detailRows) {
    const curBorderW = row.borderW || 0
    const overlap = (prevBorderW > 0 && curBorderW > 0) ? prevBorderW : 0
    let top = cursor - overlap
    if (cur.length > 0 && top + row.height > cutoffY) {
      dataPages.push({ rows: cur, dataBottom: cursor })
      cur = []; cursor = headerY; top = headerY; prevBorderW = 0
    }
    const r = { ...row, top }
    cursor = top + row.height
    prevBorderW = curBorderW
    cur.push(r)
  }
  dataPages.push({ rows: cur, dataBottom: cursor })
  return dataPages
}

/** 模板数据区底边(元素 y+height 最大);常略超 summaryA 以做 1px 叠边。 */
function designDataBandBottom (elements, headerY, summaryA) {
  let maxB = typeof summaryA === 'number' ? summaryA : 0
  for (const el of elements || []) {
    const y = el.y || 0
    if (y < headerY || y >= summaryA) continue
    maxB = Math.max(maxB, y + (el.height || 0))
  }
  return maxB
}

/** 按几何刷新 zone 内 original.groupId;已有 prevNodeId 字段则保留(见 groupPrev.ensure)。 */
function refreshZoneGroupPrev (renderedEls, prefix) {
  const originals = []
  const seen = new Set()
  for (const el of renderedEls) {
    const o = el.original
    if (!o || seen.has(o.id)) continue
    seen.add(o.id)
    originals.push(o)
  }
  ensureGroupAndPrevNode(originals, prefix)
}

/** 展开前按几何刷新模板元素 groupId,避免陈旧同组让纯 text 误跟 ds 循环。 */
function refreshTemplateGroupPrevBeforeExpand (templateData) {
  const elements = templateData.elements || []
  if (elements.length === 0) return
  const headerY = templateData.headerY
  const summaryA = templateData.summaryA
  const summaryB = templateData.summaryB
  const footerY = templateData.footerY
  const dataEls = []
  const sbfEls = []
  for (const el of elements) {
    const y = el.y || 0
    if (y >= headerY && y < summaryA) dataEls.push(el)
    else if (typeof summaryB === 'number' && typeof footerY === 'number' &&
      y >= summaryB && y < footerY) sbfEls.push(el)
  }
  ensureGroupAndPrevNode(dataEls, 'group')
  ensureGroupAndPrevNode(sbfEls, 'sbf')
}

// 汇总B→页脚:与数据区同一套 group/prev 级联。
// 自然原点 baseTop +(y - designOriginY);有 prev 则挂前驱末实例底边+设计间距。
function layoutSbfRows (sbfEls, colAxis, baseTop, designOriginY) {
  if (sbfEls.length === 0) return { rows: [], bottom: null }

  refreshZoneGroupPrev(sbfEls, 'sbf')

  equalizeGroupHeights(sbfEls)

  const lastById = new Map()
  // 先按设计 y 再按 expand 序,保证读 prev 时上方已定位
  const ordered = [...sbfEls].sort((a, b) =>
    (a.original.y || 0) - (b.original.y || 0) ||
    (a.index - b.index) ||
    (a.original.x || 0) - (b.original.x || 0)
  )

  for (const el of ordered) {
    const natural = baseTop + ((el.original.y || 0) - designOriginY)
    if (el.index === 0) {
      const placed = topFromPrimaryPrev(el, lastById, natural)
      el.top = placed.top
    } else {
      const prevEl = lastById.get(el.original.id)
      if (prevEl && prevEl.top != null) {
        const borderAdjustment = dsExpandedBorderStack(prevEl.original, el.original)
        el.top = prevEl.top + (prevEl.actualHeight || 0) - borderAdjustment
      } else {
        el.top = natural
      }
    }
    lastById.set(el.original.id, el)
  }

  const rowMap = new Map()
  for (const el of sbfEls) {
    const gid = el.original.groupId
    const key = gid
      ? `${gid}_${el.index}`
      : `t:${Math.round(el.top)}_${el.original.id}_${el.index}`
    if (!rowMap.has(key)) rowMap.set(key, [])
    rowMap.get(key).push(el)
  }
  const rows = []
  for (const els of rowMap.values()) {
    const cells = els.map(e => toCell(e, colAxis)).sort((a, b) => a.colStart - b.colStart)
    const height = Math.max(...els.map(e => e.actualHeight || e.original.height || 0))
    // 同行 ownHeight 同步为行高(渲染非 detail 带读 ownHeight)
    for (const c of cells) c.ownHeight = height
    const top = Math.min(...els.map(e => e.top))
    const borderW = Math.max(0, ...cells.map(c => (c.border && c.border.width) || 0))
    const seed = els.find(e => e.expressionPath) || els[0]
    rows.push({
      band: 'summaryBToFooter',
      top,
      height,
      cells,
      index: seed ? seed.index : 0,
      rowItem: seed ? seed.rowItem : null,
      borderW
    })
  }
  rows.sort((a, b) => a.top - b.top || a.index - b.index)
  const bottom = rows.length > 0 ? Math.max(...rows.map(r => r.top + r.height)) : null
  return { rows, bottom }
}

// ---- 聚合内容格式化(数值口径与明细列一致) ----
function formatAggregate (num, original) {
  if (num == null) return ''
  const d = Decimal.isDecimal(num) ? num : parseReportDecimal(num)
  if (d == null || !d.isFinite()) return ''
  return sanitizeReportDisplayedText(applyTextFormat(d, original))
}

// ---- 行合并(rowspan) ----
function mergeGroupKey (rowItem, mergeGroupBy) {
  const path = rowItemFieldPathFromMergeSetting(mergeGroupBy)
  if (!path) return ''
  const v = getRowField(rowItem, path)
  return (v === undefined || v === null) ? '' : String(v)
}

function segmentFieldValue (cell, field) {
  let v
  if (field && cell.rowItem != null) v = getRowField(cell.rowItem, field)
  if (v !== undefined && v !== null && v !== '') return v
  const pc = cell.parsedContent
  if (pc === undefined || pc === null || String(pc).trim() === '') return undefined
  return pc
}

function segmentSum (segment, mergeEl) {
  const rawField = (mergeEl.mergeSumField && String(mergeEl.mergeSumField).trim()) || getFirstPlaceholderToken(mergeEl.content || '')
  const field = rowItemFieldPathFromMergeSetting(rawField || '')
  let sum = new Decimal(0)
  for (const cell of segment) {
    // 方案一(所见即所得):优先取被合并列在报表上的显示值,不可解析时回退原始字段值。
    let d = parseReportDecimal(cell.parsedContent)
    if (d == null && field && cell.rowItem != null) {
      d = parseReportDecimal(getRowField(cell.rowItem, field))
    }
    if (d != null) sum = addReportAggregate(sum, d)
  }
  return sum
}

function segmentMin (segment, mergeEl) {
  const rawField = (mergeEl.mergeSumField && String(mergeEl.mergeSumField).trim()) || getFirstPlaceholderToken(mergeEl.content || '')
  const field = rowItemFieldPathFromMergeSetting(rawField || '')
  let minD = null
  for (const cell of segment) {
    const raw = segmentFieldValue(cell, field)
    const d = parseReportDecimal(raw)
    if (d != null && (minD == null || d.cmp(minD) < 0)) minD = d
  }
  return minD == null ? new Decimal(0) : minD
}

function applyRowMergeOnPage (detailRows, mergeEls) {
  if (mergeEls.length === 0 || detailRows.length === 0) return
  for (const mergeEl of mergeEls) {
    const seq = []
    for (const row of detailRows) {
      const cell = row.cells.find(c => c.original && c.original.id === mergeEl.id)
      if (cell) seq.push({ row, cell })
    }
    if (seq.length < 2) continue

    const segments = []
    let cur = [seq[0]]
    for (let i = 1; i < seq.length; i++) {
      const prev = seq[i - 1]; const curr = seq[i]
      const consecutive = curr.row.index === prev.row.index + 1
      const kPrev = mergeGroupKey(prev.cell.rowItem, mergeEl.mergeGroupBy)
      const kCurr = mergeGroupKey(curr.cell.rowItem, mergeEl.mergeGroupBy)
      if (consecutive && kCurr === kPrev && kCurr !== '') cur.push(curr)
      else { segments.push(cur); cur = [curr] }
    }
    segments.push(cur)

    for (const seg of segments) {
      if (seg.length < 2) continue
      const firstCell = seg[0].cell
      // rowSpan 覆盖的行数 = 段内行数(每条数据 1 行)
      firstCell.rowSpan = seg.length
      // 合并高度取已放置几何(含 ds 自动叠边后的真实叠盒),不用边框容差重估
      const firstRow = seg[0].row
      const lastRow = seg[seg.length - 1].row
      firstCell.mergedHeight = (lastRow.top + lastRow.height) - firstRow.top
      if (mergeEl.mergeMode === 'sum') {
        firstCell.content = sanitizeReportDisplayedText(applyTextFormat(segmentSum(seg.map(s => s.cell), mergeEl), mergeEl))
      } else if (mergeEl.mergeMode === 'min') {
        firstCell.content = sanitizeReportDisplayedText(applyTextFormat(segmentMin(seg.map(s => s.cell), mergeEl), mergeEl))
      }
      const va = mergeEl.mergeVerticalAlign
      if (va && va !== 'none') firstCell.verticalAlign = va
      for (let j = 1; j < seg.length; j++) {
        const { row, cell } = seg[j]
        row.cells = row.cells.filter(c => c !== cell)
      }
    }
  }
}

const cloneRow = (r) => ({ ...r, cells: r.cells.map(c => ({ ...c })) })

// 展开 + 度量:纯展开(coreExpand)后用注入的 measureCell 填每个实例的 actualHeight。
// 媒体(image/qrcode/barcode)固定高;其余按注入度量后端实测。
// autoGrow:数据区 + 汇总B→页脚(备注等需完整显示);页眉/汇总A-B/页脚仍固定设计高。
function expandAndMeasure (templateData, measureCell) {
  const res = coreExpand(templateData)
  for (const el of res.renderedElements) {
    const o = el.original
    if (isMedia(o.type)) {
      el.actualHeight = o.height
    } else {
      const autoGrow = !!(el.inDataArea || el.inSbfArea)
      el.actualHeight = measureCell({ ...o, parsedContent: el.displayContent }, { autoGrow }).boxHeight
    }
  }
  return res
}

/**
 * 构建流式布局模型。
 * @param {object} templateData 已填 dataset 的模板
 * @param {{ measureCell: (element: object, opts: { autoGrow: boolean }) => { boxHeight: number } }} deps
 *   measureCell 由调用方注入:边车用 napi 无头度量,设计器用 DOM offsetHeight 适配器。
 * @returns {{ paperSize, columns, colBounds, totalPages, pages }}
 *   pages[i] = { pageIndex, rows: [{ band, top, height, cells:[...] }] }(rows 按 top 升序)
 */
export function buildFlowModel (templateData, { measureCell } = {}) {
  if (typeof measureCell !== 'function') {
    throw new Error('buildFlowModel requires deps.measureCell(element, { autoGrow }) => { boxHeight }')
  }
  const paperSize = templateData.paperSize || { width: 794, height: 1123 }
  const headerY = templateData.headerY
  const summaryA = templateData.summaryA
  const summaryB = templateData.summaryB
  const footerY = templateData.footerY
  const summaryBandHeight = Math.max(0, (summaryB ?? footerY) - (summaryA ?? footerY))
  // 设计数据区底边(可 > summaryA):汇总/SBF 相对此底边定位,保留模板叠边
  const designDataBottom = designDataBandBottom(templateData.elements, headerY, summaryA)

  // 必须在 expand 之前刷新 groupId:同组 text 跟随 ds 循环依赖正确分组,
  // 否则高度/Y 已拆组的纯 text 仍会因模板陈旧 groupId 被循环生成。
  refreshTemplateGroupPrevBeforeExpand(templateData)

  const { renderedElements, sumSet, subtotalSet } = expandAndMeasure(templateData, measureCell)

  // 分带
  const headerEls = []; const dataEls = []; const summaryEls = []; const sbfEls = []; const footerEls = []
  for (const el of renderedElements) {
    const y = el.original.y || 0
    if (y < headerY) headerEls.push(el)
    else if (y >= footerY) footerEls.push(el)
    else if (y >= summaryB && y < footerY) sbfEls.push(el)
    else if (y >= summaryA && y < summaryB) summaryEls.push(el)
    else dataEls.push(el)
  }

  // 列模型(仅供 Excel 下游量化用):由 detail 带元素 x/width 量化出数据列;无数据行则退回全部元素。
  // PDF/HTML 不吸附此网格,而是按模板精确坐标渲染(见 render-flow.mjs flowToPlacedPages),忠实还原设计。
  const colEdgeEls = dataEls.length > 0 ? dataEls : renderedElements
  const colEdges = [0, paperSize.width]
  const seenCol = new Set()
  for (const el of colEdgeEls) {
    const o = el.original
    if (seenCol.has(o.id)) continue
    seenCol.add(o.id)
    colEdges.push(o.x || 0, (o.x || 0) + (o.width || 0))
  }
  const colAxis = buildColumnAxis(colEdges)

  // 逻辑行
  const headerRows = clusterVisualRows(headerEls, 'header', colAxis)
  const footerRows = clusterVisualRows(footerEls, 'footer', colAxis)
  const summaryTplRows = clusterVisualRows(summaryEls, 'summary', colAxis)

  // 先量 SBF 块高(以 summaryB 为原点、baseTop=0),分页时与汇总带一并预留,保证每页数据后都能放下 SBF。
  const sbfMeasure = layoutSbfRows(sbfEls, colAxis, 0, summaryB)
  const sbfBlockHeight = sbfMeasure.bottom != null ? Math.max(0, sbfMeasure.bottom) : 0

  // 数据区流式分页:cutoffY = footerY - 汇总带高 - SBF 块高。
  // 有 prevNodeId 时按设计器依赖链级联(多段表/表头与数据分行);否则按 index 单表游标。
  // 布局前按几何刷新 groupId,纠正模板里「不同 Y 仍同组」的陈旧值;prevNodeId 保留。
  refreshZoneGroupPrev(dataEls, 'group')
  const cutoffY = (typeof footerY === 'number')
    ? (footerY - summaryBandHeight - sbfBlockHeight)
    : (paperSize.height)
  const dataPages = usesPrevNode(dataEls)
    ? layoutDataPagesByPrevNode(dataEls, colAxis, headerY, cutoffY)
    : paginateDetailRows(buildDetailRows(dataEls, colAxis, measureCell), headerY, cutoffY)
  const detailRows = dataPages.flatMap(dp => dp.rows)

  // 合计/小计单元格数字格式(方案一回退舍入用):sum/subtotal 括号内表达式 -> 该合计单元格。
  const sumFormatByInner = new Map()
  const subtotalFormatByInner = new Map()
  for (const el of (templateData.elements || [])) {
    const content = (el && el.content) || ''
    const sm = content.match(/\$\{sum\(([^}]*)\)\}/)
    if (sm && !sumFormatByInner.has(sm[1])) sumFormatByInner.set(sm[1], el)
    const subm = content.match(/\$\{subtotal\(([^}]*)\)\}/)
    if (subm && !subtotalFormatByInner.has(subm[1])) subtotalFormatByInner.set(subm[1], el)
  }

  // 全局 sum 预聚合(遍历所有 detail 行,按行去重)
  const sumMap = new Map()
  const sumSeen = new Set()
  for (const row of detailRows) {
    const pathCell = row.cells.find(c => c.expressionPath) || row.cells[0]
    const exprPathNorm = pathCell ? String(pathCell.expressionPath || '').toLowerCase() : ''
    if (!exprPathNorm) continue
    const rowDisplayMap = buildRowDisplayMap(row.cells)
    for (const sumInner of sumSet) {
      const primary = extractPrimaryDatasetFromSumInner(sumInner)
      if (!primary || primary !== exprPathNorm) continue
      const key = `${exprPathNorm}:${row.index}:${sumInner}`
      if (sumSeen.has(key)) continue
      sumSeen.add(key)
      const delta = evaluateReportAggregateExpression(sumInner, row.rowItem, {
        cellDisplayValue: pathCell.parsedContent,
        rowDisplayMap,
        aggregateFormat: sumFormatByInner.get(sumInner)
      })
      sumMap.set(sumInner, addReportAggregate(sumMap.get(sumInner) ?? new Decimal(0), delta))
    }
  }

  // 汇总B→页脚:每页紧跟该页数据底排版(空间已在 cutoff 预留,不再整带挪到下一页)。
  // 原点用设计数据区底边(非 summaryA),与汇总带同一参照,保留模板叠边/间距。
  const sbfOnDataPages = dataPages.map(dp => layoutSbfRows(sbfEls, colAxis, dp.dataBottom, designDataBottom))

  const pageSpecs = dataPages.map((_, di) => ({
    kind: 'data',
    dataIdx: di,
    sbfLayout: sbfOnDataPages[di]
  }))
  const totalPages = pageSpecs.length

  // 按页 subtotal(仅 detail 行,按行去重;key 带数据集路径,避免双表同 index 互相覆盖)
  const subtotalByDataPage = dataPages.map(dp => {
    const map = new Map(); const seen = new Set()
    for (const row of dp.rows) {
      const pathCell = row.cells.find(c => c.expressionPath) || row.cells[0]
      const exprPathNorm = pathCell ? String(pathCell.expressionPath || '').toLowerCase() : ''
      if (!exprPathNorm) continue
      const rowDisplayMap = buildRowDisplayMap(row.cells)
      for (const subInner of subtotalSet) {
        const primary = extractPrimaryDatasetFromSumInner(subInner)
        if (!primary || primary !== exprPathNorm) continue
        const key = `${exprPathNorm}:${row.index}:${subInner}`
        if (seen.has(key)) continue
        seen.add(key)
        const delta = evaluateReportAggregateExpression(subInner, row.rowItem, {
          cellDisplayValue: pathCell.parsedContent,
          rowDisplayMap,
          aggregateFormat: subtotalFormatByInner.get(subInner)
        })
        map.set(subInner, addReportAggregate(map.get(subInner) ?? new Decimal(0), delta))
      }
    }
    return map
  })

  const resolveCellContent = (cell, pageIndex, subtotalMap) => {
    const content = (cell.original && cell.original.content) || ''
    let text = cell.content
    if (content.includes('${page}') || content.includes('${total}')) {
      let updated = content
      if (content.includes('${page}')) updated = updated.replace(/\$\{page\}/g, pageIndex + 1)
      if (content.includes('${total}')) updated = updated.replace(/\$\{total\}/g, totalPages)
      text = sanitizeReportDisplayedText(updated)
    }
    const subMatch = content.match(/\$\{subtotal\(([^}]*)\)\}/)
    if (subMatch && subtotalSet.has(subMatch[1]) && subtotalMap && subtotalMap.has(subMatch[1])) {
      text = formatAggregate(subtotalMap.get(subMatch[1]), cell.original)
    }
    const sumMatch = content.match(/\$\{sum\(([^}]*)\)\}/)
    if (sumMatch && sumSet.has(sumMatch[1]) && sumMap.has(sumMatch[1])) {
      text = formatAggregate(sumMap.get(sumMatch[1]), cell.original)
    }
    return text
  }

  const mergeEls = (templateData.elements || []).filter(el =>
    (el.mergeMode === 'first' || el.mergeMode === 'sum' || el.mergeMode === 'min') &&
    el.mergeGroupBy && String(el.mergeGroupBy).trim() !== '' &&
    (el.type === 'text' || el.type === 'data')
  )

  // 组装每页
  const pages = []
  for (let pi = 0; pi < pageSpecs.length; pi++) {
    const spec = pageSpecs[pi]
    const rows = []
    const subtotalMap = subtotalByDataPage[spec.dataIdx] || null

    for (const r of headerRows) { const c = cloneRow(r); c.top = r.anchorY; rows.push(c) }

    if (spec.kind === 'data') {
      const dp = dataPages[spec.dataIdx]
      const detailOfPage = dp.rows.map(cloneRow)
      applyRowMergeOnPage(detailOfPage, mergeEls)
      for (const r of detailOfPage) rows.push(r)

      // 汇总 A/B(每页,紧跟本页数据底;相对设计数据区底边,保留 1px 叠边等模板间距)
      for (const r of summaryTplRows) {
        const c = cloneRow(r); c.top = dp.dataBottom + (r.anchorY - designDataBottom); rows.push(c)
      }
      // 汇总B→页脚(每页重复,上移紧跟数据区;group/prev 级联)
      if (spec.sbfLayout) {
        for (const r of spec.sbfLayout.rows) rows.push(cloneRow(r))
      }
    }

    for (const r of footerRows) { const c = cloneRow(r); c.top = r.anchorY; rows.push(c) }

    for (const row of rows) {
      for (const cell of row.cells) cell.content = resolveCellContent(cell, pi, subtotalMap)
    }
    rows.sort((a, b) => a.top - b.top)
    pages.push({ pageIndex: pi, rows })
  }

  return {
    paperSize,
    columns: colAxis.columns,
    colBounds: colAxis.bounds,
    totalPages,
    pages
  }
}
