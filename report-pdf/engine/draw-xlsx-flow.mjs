// Excel 导出(方案 A:消费 flow.mjs 流式分带模型,按模板几何还原,PDF/HTML/Excel 同源)。
// 列轴:由「所有元素的 x 边界」量化出列(列宽=相邻边界差),每个元素按其 x/宽度映射到列跨(colspan)。
// 行轴:每页由「该页所有元素的 y 边界」量化出行(行高=相邻边界差),元素按 y/高度映射到行跨(rowspan);
//       页眉/汇总/页脚里的高元素自然跨多行,数据行各占一行(自增高),元素间空白=无元素的空行,尾部补到页高。
// 分页:每页一段连续 Excel 行,页间插分页符。图片在其单元格区域内居中锚定。
// 富文本按 run 切字体,保留内容真实 \n(wrapText 显示换行)。
// formatType=number|date，或模板数值函数(row/sum/subtotal/count/page/total、合并sum/min) → 原生数字/日期；
// 普通文本即使长得像数字仍保持文本，避免编码被误读。
import './fonts.mjs'
import ExcelJS from 'exceljs'
import { parseReportDecimal } from '@niqer/report-core/expressions'
import {
  resolveFontWeight,
  resolveFontStyle,
  resolveFontSizePx,
  resolveBorderWidth,
  resolveShrinkToFit
} from './measure.mjs'
import { fontKeyForFamily, REPORT_MEDIA_PADDING_PX } from './font-policy.mjs'
import { splitRuns, normalizeGlyphs } from './metrics.mjs'
import { generateMediaImage } from './media.mjs'

// ExcelJS column.width = OpenXML width ≈ px/MDW(Calibri 11@96dpi MDW≈7)。
const EXCEL_MDW = 7
const PT_PER_PX = 72 / 96
const EMU_PER_PX = 9525   // 96dpi:1px = 9525 EMU(图片锚点偏移用真实 EMU,绕开 ExcelJS 分数列换算缺陷)
const MAX_ROW_PT = 409
const MAX_COL_CHAR = 255
const AXIS_TOL = 2   // 边界吸附容差(px):相邻小于此值的边界合并为一条

const H_ALIGN = { left: 'left', center: 'center', right: 'right' }
const V_ALIGN = { top: 'top', center: 'middle', bottom: 'bottom' }

function colWidthChars (px) {
  return Math.min(MAX_COL_CHAR, Math.max(0.5, (Number(px) || 0) / EXCEL_MDW))
}
function rowHeightPt (px) { return Math.min(MAX_ROW_PT, Math.max(1, px * PT_PER_PX)) }

function toArgb (color) {
  if (!color || typeof color !== 'string') return null
  let s = color.trim()
  if (s.startsWith('#')) {
    s = s.slice(1)
    if (s.length === 3) s = s.split('').map(c => c + c).join('')
    if (s.length === 6) return ('FF' + s).toUpperCase()
    if (s.length === 8) return s.toUpperCase()
    return null
  }
  const m = s.match(/^rgba?\(([^)]+)\)/i)
  if (m) {
    const parts = m[1].split(',').map(x => x.trim())
    if (parts.length < 3) return null
    const hex = parts.slice(0, 3).map(v => {
      const n = Math.max(0, Math.min(255, parseInt(v, 10) || 0))
      return n.toString(16).padStart(2, '0')
    }).join('')
    return ('FF' + hex).toUpperCase()
  }
  return null
}

function runFontName (fontKey) {
  if (fontKey === 'song') return '宋体'
  if (fontKey === 'hei') return '黑体'
  if (fontKey === 'symbol') return 'Segoe UI Symbol'
  return 'Times New Roman'
}

function borderStyleFor (widthPx, style) {
  if (style === 'dashed') return 'dashed'
  if (style === 'dotted') return 'dotted'
  if (widthPx >= 3) return 'thick'
  if (widthPx >= 2) return 'medium'
  return 'thin'
}

function borderSidesOf (border) {
  if (!border) return { top: false, right: false, bottom: false, left: false }
  const flagged = border.top != null || border.right != null || border.bottom != null || border.left != null
  if (!flagged) return { top: true, right: true, bottom: true, left: true }
  return {
    top: border.top !== false,
    right: border.right !== false,
    bottom: border.bottom !== false,
    left: border.left !== false
  }
}

function applyRectBorder (ws, r1, c1, r2, c2, border) {
  const sides = borderSidesOf(border)
  if (!sides.top && !sides.right && !sides.bottom && !sides.left) return
  const argb = toArgb((border && border.color) || '#000000') || 'FF000000'
  const style = borderStyleFor((border && border.width) || 1, border && border.style)
  const side = { style, color: { argb } }
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c)
      const b = Object.assign({}, cell.border)
      if (r === r1 && sides.top) b.top = side
      if (r === r2 && sides.bottom) b.bottom = side
      if (c === c1 && sides.left) b.left = side
      if (c === c2 && sides.right) b.right = side
      cell.border = b
    }
  }
}

function safeMerge (ws, r1, c1, r2, c2) {
  const guard = ws.__mergeGuard || (ws.__mergeGuard = new Set())
  const key = r1 + ':' + c1 + ':' + r2 + ':' + c2
  if (guard.has(key)) return
  try { ws.mergeCells(r1, c1, r2, c2); guard.add(key) } catch { /* 重叠版式:跳过 */ }
}

function cellPlainFont (cell) {
  const o = cell.original || {}
  const primaryKey = fontKeyForFamily(o.style && o.style.fontFamily)
  const deco = (o.style && o.style.textDecoration) || 'none'
  return {
    name: runFontName(primaryKey),
    size: resolveFontSizePx(o) * PT_PER_PX,
    bold: resolveFontWeight(o),
    italic: resolveFontStyle(o),
    underline: deco === 'underline',
    strike: deco === 'line-through',
    color: { argb: toArgb((o.style && o.style.color) || '#000000') || 'FF000000' }
  }
}

// 富文本按 run 切字体。只保留模板内容里的「真换行 \n」(设计者写入的硬换行,原样呈现);
// 文本过宽时的软换行交给 Excel 自己(wrapText,可随列宽回流),本端不硬塞软换行。
function buildRichText (cell) {
  const o = cell.original || {}
  const content = cell.content != null ? String(cell.content) : ''
  const primaryKey = fontKeyForFamily(o.style && o.style.fontFamily)
  const base = cellPlainFont(cell)
  const mkFont = (name) => ({ ...base, name })
  const str = normalizeGlyphs(content)
  if (!str) return []
  const rich = []
  for (const run of splitRuns(str, primaryKey)) {
    if (!run.text) continue
    rich.push({ text: run.text, font: mkFont(runFontName(run.fontKey)) })
  }
  return rich
}

function normalizeExcelDecimalPlaces (dp) {
  if (dp === null || dp === undefined || dp === '' || dp === 'auto') return null
  const n = Number(dp)
  if (!Number.isFinite(n)) return null
  const i = Math.trunc(n)
  if (i < 0) return 0
  if (i > 10) return 10
  return i
}

function excelFixedPattern (places, grouping) {
  const intPart = grouping ? '#,##0' : '0'
  if (!(places > 0)) return intPart
  return `${intPart}.${'0'.repeat(places)}`
}

/** Map report numberFormat → Excel numFmt (display matches applyTextFormat). */
export function excelNumFmtForElement (element = {}) {
  const fmt = String(element.numberFormat || 'default')
  const dp = normalizeExcelDecimalPlaces(element.decimalPlaces)
  switch (fmt) {
    case 'currency': {
      const places = dp == null ? 2 : dp
      const symbol = String(element.currencySymbol ?? '¥').replace(/"/g, '')
      const grouping = element.useGrouping !== false
      return `"${symbol}"${excelFixedPattern(places, grouping)}`
    }
    case 'percent': {
      const places = dp == null ? 2 : dp
      return places > 0 ? `0.${'0'.repeat(places)}%` : '0%'
    }
    case 'integer':
    case 'fixed0': {
      const places = dp == null ? 0 : dp
      return excelFixedPattern(places, false)
    }
    case 'fixed2': {
      const places = dp == null ? 2 : dp
      return excelFixedPattern(places, false)
    }
    default: {
      if (dp == null) return 'General'
      return excelFixedPattern(dp, false)
    }
  }
}

/** Build a UTC Date from Y/M/D(/h/m/s) so ExcelJS serializes the intended calendar day. */
function utcDate (year, month, day, hours = 0, minutes = 0, seconds = 0) {
  if (![year, month, day].every((n) => Number.isFinite(n))) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day, hours || 0, minutes || 0, seconds || 0))
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) return null
  return d
}

/** Map report dateFormat → Excel numFmt. */
export function excelDateNumFmtForElement (element = {}) {
  switch (String(element.dateFormat || 'yyyy-MM-dd')) {
    case 'yyyy-MM-dd HH:mm:ss':
      return 'yyyy-mm-dd hh:mm:ss'
    case 'yyyy/MM/dd':
      return 'yyyy/mm/dd'
    case 'yyyy年MM月dd日':
      return 'yyyy"年"mm"月"dd"日"'
    case 'MM/dd/yyyy':
      return 'mm/dd/yyyy'
    case 'dd/MM/yyyy':
      return 'dd/mm/yyyy'
    case 'yyyy-MM-dd':
    default:
      return 'yyyy-mm-dd'
  }
}

/**
 * Parse report display date text back to Date using the element's dateFormat.
 * Uses UTC wall-clock components to avoid Excel day-shift across timezones.
 */
export function parseExcelDateFromDisplay (text, dateFormat = 'yyyy-MM-dd') {
  const t = String(text || '').trim()
  if (!t || t.includes('\n')) return null
  const fmt = String(dateFormat || 'yyyy-MM-dd')
  let m
  switch (fmt) {
    case 'yyyy-MM-dd':
      m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      return m ? utcDate(+m[1], +m[2], +m[3]) : null
    case 'yyyy-MM-dd HH:mm:ss':
      m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/)
      return m ? utcDate(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]) : null
    case 'yyyy/MM/dd':
      m = t.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
      return m ? utcDate(+m[1], +m[2], +m[3]) : null
    case 'yyyy年MM月dd日':
      m = t.match(/^(\d{4})年(\d{2})月(\d{2})日$/)
      return m ? utcDate(+m[1], +m[2], +m[3]) : null
    case 'MM/dd/yyyy':
      m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      return m ? utcDate(+m[3], +m[1], +m[2]) : null
    case 'dd/MM/yyyy':
      m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      return m ? utcDate(+m[3], +m[2], +m[1]) : null
    default:
      m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/)
      return m ? utcDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null
  }
}

/** 模板内置数值计算：序号/合计/小计/计数/页码，以及合并求和·最小值。 */
const TEMPLATE_NUMERIC_FN_RE = /\$\{\s*(?:sum|subtotal|count|row)\s*\(/i
const TEMPLATE_PAGE_TOTAL_RE = /\$\{\s*(?:page|total)\s*\}/i

export function isTemplateNumericCompute (original = {}) {
  const content = String(original.content || '')
  if (TEMPLATE_NUMERIC_FN_RE.test(content) || TEMPLATE_PAGE_TOTAL_RE.test(content)) return true
  const mergeMode = String(original.mergeMode || '').toLowerCase()
  return mergeMode === 'sum' || mergeMode === 'min'
}

/**
 * Typed Excel cell:
 * - formatType=date → Date + date numFmt
 * - formatType=number → number + report numFmt
 * - 模板数值函数(row/sum/subtotal/count/page/total)或合并 sum/min → 数字(有数字格式用其 numFmt，否则 General)
 * 普通文本即使长得像数字仍保持文本。
 */
export function resolveExcelTypedValue (cell) {
  const o = cell?.original || {}
  const formatType = String(o.formatType || 'none').toLowerCase()
  const forceNumber = formatType === 'number' || isTemplateNumericCompute(o)
  if (formatType !== 'date' && !forceNumber) return null

  const raw = cell.content != null ? cell.content : cell.parsedContent
  if (raw === null || raw === undefined || raw === '') return null
  const text = String(raw).trim()
  if (!text || text.includes('\n')) return null

  if (formatType === 'date') {
    const date = parseExcelDateFromDisplay(text, o.dateFormat || 'yyyy-MM-dd')
    if (!date) return null
    return { value: date, numFmt: excelDateNumFmtForElement(o) }
  }

  const d = parseReportDecimal(text)
  if (d == null) return null
  const n = d.toNumber()
  if (!Number.isFinite(n)) return null
  return {
    value: n,
    numFmt: formatType === 'number' ? excelNumFmtForElement(o) : 'General'
  }
}

// 边界量化:输入若干边(px)→ 排序去重(容差合并)的边界数组 + 就近索引 + 分数定位。
function buildAxis (edges, maxEdge) {
  const set = new Set([0])
  if (maxEdge != null) set.add(Math.round(maxEdge))
  for (const e of edges) set.add(Math.round(e))
  const sorted = [...set].sort((a, b) => a - b)
  const bounds = []
  for (const v of sorted) if (bounds.length === 0 || v - bounds[bounds.length - 1] > AXIS_TOL) bounds.push(v)
  if (bounds.length < 2) bounds.push((bounds[0] || 0) + 1)
  const nearest = (val) => {
    let best = 0; let bestD = Infinity
    for (let i = 0; i < bounds.length; i++) { const d = Math.abs(bounds[i] - val); if (d < bestD) { bestD = d; best = i } }
    return best
  }
  return { bounds, nearest, count: bounds.length - 1 }
}

// 绝对坐标(px) → { native: 0 基格序, off: 格内偏移(EMU) }。
// 直接给 EMU 偏移(而非 ExcelJS 的分数 col/row),绕开其「width字符×10000 冒充列EMU宽」的换算缺陷(列偏移会缩水~6.7倍)。
function pxToAnchor (bounds, base, px) {
  const val = Math.max(bounds[0], Math.min(bounds[bounds.length - 1], px))
  let i = 0
  while (i < bounds.length - 1 && bounds[i + 1] <= val) i++
  return { native: base + i, off: Math.max(0, Math.round((val - bounds[i]) * EMU_PER_PX)) }
}

// 单元格渲染高度:合并格用合并高;detail 数据行用统一行高;其余带用各自设计高(与 PDF/HTML 同口径)。
function cellPlacedHeight (cell, row) {
  if (cell.rowSpan > 1 && cell.mergedHeight) return cell.mergedHeight
  if (row.band === 'detail') return row.height
  return (cell.ownHeight != null ? cell.ownHeight : row.height)
}

// 单元格在页内的绝对矩形(x/宽度取模板设计值,y 取逻辑行 top,高度见上)。
function placedRect (cell, row) {
  const o = cell.original || {}
  const x = (typeof o.x === 'number') ? o.x : 0
  const w = (typeof o.width === 'number') ? o.width : 0
  const y = row.top || 0
  const h = cellPlacedHeight(cell, row)
  return { x, y, w, h }
}

function writeTextCell (ws, cell, r1, c1, r2, c2) {
  const target = ws.getCell(r1, c1)
  const shrink = resolveShrinkToFit(cell) || resolveShrinkToFit(cell.original)
  const typed = resolveExcelTypedValue(cell)
  if (typed) {
    target.value = typed.value
    target.numFmt = typed.numFmt
    target.font = cellPlainFont(cell)
  } else {
    const rich = buildRichText(cell)
    if (rich.length > 0) target.value = { richText: rich }
  }
  target.alignment = {
    horizontal: H_ALIGN[cell.textAlign] || 'center',
    vertical: V_ALIGN[cell.verticalAlign] || 'top',
    wrapText: !shrink,
    shrinkToFit: shrink
  }
  const bg = cell.fill || (cell.style && cell.style.backgroundColor)
  const bgArgb = bg && typeof bg === 'string' && !bg.includes('gradient') ? toArgb(bg) : null
  if (bgArgb) target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } }
  if (r2 > r1 || c2 > c1) safeMerge(ws, r1, c1, r2, c2)
  if (resolveBorderWidth(cell) > 0) applyRectBorder(ws, r1, c1, r2, c2, cell.border)
}

// twoCell 锚点:from/to 两角均用真实 EMU 偏移(见 pxToAnchor),editAs='twoCell' 让查看器按 from→to 填充图片矩形。
// 相比 oneCell+ext,twoCellAnchor 在 Excel/WPS/LibreOffice 里对图片定位/居中的兼容性最好(oneCell 的 colOff/ext 各家解析不一)。
// 传入矩形已按等比缩放算好(aspect=图片aspect),填充不变形。
function anchorMediaImage (ws, wb, media, tl, br) {
  const imgId = wb.addImage({ buffer: media.buffer, extension: 'png' })
  ws.addImage(imgId, { tl, br, editAs: 'twoCell' })
}

// 图片:等比缩放进「设计内框(去 padding/border)」并在单元格区域内居中,按绝对坐标锚定到列/行分数。
function writeMediaCell (ws, wb, cell, media, colBounds, rowBounds, excelBase, rc, r1, c1, r2, c2) {
  let bg = cell.fill
  if (!bg) bg = cell.type === 'image' ? null : '#f8f9fa'
  const bgArgb = bg && typeof bg === 'string' && !bg.includes('gradient') ? toArgb(bg) : null
  if (bgArgb) ws.getCell(r1, c1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } }
  if (r2 > r1 || c2 > c1) safeMerge(ws, r1, c1, r2, c2)
  const border = resolveBorderWidth(cell)
  if (border > 0) applyRectBorder(ws, r1, c1, r2, c2, cell.border)
  if (!media || !media.buffer) return

  const pad = REPORT_MEDIA_PADDING_PX
  const innerW = Math.max(1, rc.w - 2 * border - 2 * pad)
  const innerH = Math.max(1, rc.h - 2 * border - 2 * pad)
  const imgW = Math.max(1, media.width || 1)
  const imgH = Math.max(1, media.height || 1)
  const scale = Math.min(innerW / imgW, innerH / imgH)
  const dispW = Math.max(1, imgW * scale)
  const dispH = Math.max(1, imgH * scale)
  // 在单元格「内框(去 padding/border)」里等比缩放并居中,得到图片矩形的四角绝对坐标。
  const imgLeftPx = rc.x + border + pad + (innerW - dispW) / 2
  const imgTopPx = rc.y + border + pad + (innerH - dispH) / 2
  const la = pxToAnchor(colBounds, 0, imgLeftPx)
  const ra = pxToAnchor(rowBounds, excelBase - 1, imgTopPx)
  const rb = pxToAnchor(colBounds, 0, imgLeftPx + dispW)
  const bb = pxToAnchor(rowBounds, excelBase - 1, imgTopPx + dispH)
  const tl = { nativeCol: la.native, nativeColOff: la.off, nativeRow: ra.native, nativeRowOff: ra.off }
  const br = { nativeCol: rb.native, nativeColOff: rb.off, nativeRow: bb.native, nativeRowOff: bb.off }
  anchorMediaImage(ws, wb, media, tl, br)
}

/**
 * flow 模型 → xlsx Buffer。
 * @param {object} model buildFlowModel 产出({ paperSize, columns, colBounds, totalPages, pages })
 */
export async function buildXlsxBufferFromFlow (model) {
  const { paperSize, pages } = model
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('report', { views: [{ showGridLines: false }] })

  // 1) 列轴:所有页所有元素的 x 边界 → 列宽/列数(横向按模板还原)
  const xEdges = []
  for (const pg of pages) {
    for (const row of pg.rows) {
      for (const cell of row.cells) { const rc = placedRect(cell, row); xEdges.push(rc.x, rc.x + rc.w) }
    }
  }
  const colAxis = buildAxis(xEdges, paperSize.width)
  for (let i = 0; i < colAxis.count; i++) {
    ws.getColumn(i + 1).width = colWidthChars(colAxis.bounds[i + 1] - colAxis.bounds[i])
  }

  const mediaJobs = []
  let excelBase = 1  // 当前页在 Excel 中的起始行(1 基)

  for (let pi = 0; pi < pages.length; pi++) {
    const rows = pages[pi].rows || []
    // 2) 该页行轴:该页所有元素的 y 边界(补页高,末尾行到页底以对齐打印分页)
    const yEdges = []
    const rects = []
    for (const row of rows) {
      for (const cell of row.cells) { const rc = placedRect(cell, row); yEdges.push(rc.y, rc.y + rc.h); rects.push({ cell, rc }) }
    }
    const rowAxis = buildAxis(yEdges, paperSize.height)
    for (let i = 0; i < rowAxis.count; i++) {
      ws.getRow(excelBase + i).height = rowHeightPt(rowAxis.bounds[i + 1] - rowAxis.bounds[i])
    }

    // 3) 写单元格:x/宽度 → 列跨,y/高度 → 行跨(高元素自然 rowspan)
    for (const { cell, rc } of rects) {
      const c1 = colAxis.nearest(rc.x) + 1
      let c2 = colAxis.nearest(rc.x + rc.w)
      if (c2 < c1) c2 = c1
      const r1 = excelBase + rowAxis.nearest(rc.y)
      let r2 = excelBase + rowAxis.nearest(rc.y + rc.h) - 1
      if (r2 < r1) r2 = r1
      if (cell.isMedia) mediaJobs.push({ cell, rc, colBounds: colAxis.bounds, rowBounds: rowAxis.bounds, excelBase, r1, c1, r2, c2 })
      else writeTextCell(ws, cell, r1, c1, r2, c2)
    }

    excelBase += rowAxis.count
    if (pi < pages.length - 1) ws.getRow(excelBase - 1).addPageBreak()
  }

  for (const job of mediaJobs) {
    const src = Object.assign({}, job.cell.original || {}, { parsedContent: job.cell.content })
    const media = await generateMediaImage(src)
    writeMediaCell(ws, wb, job.cell, media, job.colBounds, job.rowBounds, job.excelBase, job.rc, job.r1, job.c1, job.r2, job.c2)
  }

  const landscape = paperSize.width > paperSize.height
  ws.pageSetup = {
    paperSize: 9,
    orientation: landscape ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0, right: 0, top: 0, bottom: 0, header: 0, footer: 0 }
  }

  const buf = await wb.xlsx.writeBuffer()
  let elementCount = 0
  for (const pg of pages) for (const row of pg.rows) elementCount += row.cells.length
  return { buffer: Buffer.from(buf), totalPages: pages.length || 1, elementCount }
}
