// 标签布局:整页按数据集行克隆,一行一页,元素钉在设计坐标。
// 不走数据区堆行分页、不预留汇总/SBF、不 autoGrow(避免条码被顶歪)。
import { expandElements as coreExpand } from './expand.js'
import { sanitizeReportDisplayedText } from '../expressions.js'
import { attachTemplateRfid } from '../rfid.js'

const AXIS_TOL = 2

function isMedia (t) { return t === 'image' || t === 'qrcode' || t === 'barcode' }
function isFixedBox (t) { return isMedia(t) || t === 'rect' }

function buildColumnAxis (edges) {
  const uniq = [...new Set(edges.map(v => Math.round(v)))].sort((a, b) => a - b)
  const bounds = []
  for (const v of uniq) {
    if (bounds.length === 0 || v - bounds[bounds.length - 1] > AXIS_TOL) bounds.push(v)
  }
  if (bounds.length < 2) {
    const w = bounds[0] != null ? bounds[0] : 0
    bounds.length = 0
    bounds.push(0, Math.max(1, w))
  }
  const count = bounds.length - 1
  const columns = []
  for (let i = 0; i < count; i++) columns.push({ start: bounds[i], end: bounds[i + 1] })
  const spanOf = (x, width) => {
    const left = x
    const right = x + width
    let colStart = 1
    let colEnd = count
    for (let i = 0; i < bounds.length - 1; i++) {
      if (Math.abs(bounds[i] - left) <= AXIS_TOL || bounds[i] <= left) colStart = i + 1
    }
    for (let i = 1; i < bounds.length; i++) {
      if (Math.abs(bounds[i] - right) <= AXIS_TOL || bounds[i] >= right) {
        colEnd = i
        break
      }
    }
    if (colEnd < colStart) colEnd = colStart
    return { colStart, colEnd }
  }
  return { bounds, columns, count, spanOf }
}

function toCell (el, colAxis) {
  const o = el.original
  const { colStart, colEnd } = colAxis.spanOf(o.x || 0, o.width || 0)
  const height = (el.actualHeight != null ? el.actualHeight : (o.height || 0))
  return {
    colStart,
    colEnd,
    rowSpan: 1,
    type: o.type,
    content: el.displayContent != null ? el.displayContent : el.parsedContent,
    ownHeight: height,
    textAlign: o.textAlign,
    verticalAlign: o.verticalAlign,
    shrinkToFit: o.shrinkToFit === true,
    border: o.border,
    style: o.style,
    fill: el.previewRowHighlightBackground || (o.style && o.style.backgroundColor) || null,
    original: o,
    isMedia: isMedia(o.type),
    isFixedBox: isFixedBox(o.type),
    index: el.index,
    rowItem: el.rowItem,
    expressionPath: el.expressionPath,
    parsedContent: el.parsedContent
  }
}

function expandAndMeasureLabel (templateData, measureCell) {
  const res = coreExpand(templateData)
  for (const el of res.renderedElements) {
    const o = el.original
    // 标签钉设计高:不 autoGrow。媒体/框固定高;文本也按设计盒,避免把条码顶歪。
    if (isFixedBox(o.type) || typeof measureCell !== 'function') {
      el.actualHeight = o.height || 0
    } else {
      const measured = measureCell({ ...o, parsedContent: el.displayContent }, { autoGrow: false })
      el.actualHeight = (o.height != null ? o.height : measured.boxHeight) || 0
    }
  }
  return res
}

function applyPageTokens (cell, pageIndex, displayTotalPages, streamPageOffset) {
  const content = (cell.original && cell.original.content) || ''
  if (!content.includes('${page}') && !content.includes('${total}')) return
  let updated = content
  if (content.includes('${page}')) {
    updated = updated.replace(/\$\{page\}/g, streamPageOffset + pageIndex + 1)
  }
  if (content.includes('${total}')) {
    updated = updated.replace(/\$\{total\}/g, displayTotalPages)
  }
  cell.content = sanitizeReportDisplayedText(updated)
}

/**
 * @param {object} templateData
 * @param {{ measureCell: Function }} deps
 * @returns {{ paperSize, columns, colBounds, totalPages, pages }}
 */
export function buildLabelFlowModel (templateData, { measureCell } = {}) {
  const paperSize = templateData.paperSize || { width: 794, height: 1123 }
  const { renderedElements } = expandAndMeasureLabel(templateData, measureCell)

  const colEdges = [0, paperSize.width]
  const seenCol = new Set()
  for (const el of renderedElements) {
    const o = el.original
    if (seenCol.has(o.id)) continue
    seenCol.add(o.id)
    colEdges.push(o.x || 0, (o.x || 0) + (o.width || 0))
  }
  const colAxis = buildColumnAxis(colEdges)

  const byIndex = new Map()
  for (const el of renderedElements) {
    if (!byIndex.has(el.index)) byIndex.set(el.index, [])
    byIndex.get(el.index).push(el)
  }
  const indices = [...byIndex.keys()].sort((a, b) => a - b)

  const stream = (templateData && templateData.stream && typeof templateData.stream === 'object')
    ? templateData.stream
    : {}
  const pageOffset = Number(stream.pageOffset)
  const streamPageOffset = Number.isFinite(pageOffset) && pageOffset > 0 ? Math.floor(pageOffset) : 0
  const forcedTotal = Number(stream.forcedTotalPages)
  const totalPages = indices.length
  const displayTotalPages = (Number.isFinite(forcedTotal) && forcedTotal > 0)
    ? Math.floor(forcedTotal)
    : totalPages

  const pages = indices.map((idx, pi) => {
    const els = byIndex.get(idx)
    const rows = els.map(el => {
      const cell = toCell(el, colAxis)
      const y = el.original.y || 0
      applyPageTokens(cell, pi, displayTotalPages, streamPageOffset)
      return {
        band: 'label',
        top: y,
        anchorY: y,
        height: cell.ownHeight,
        cells: [cell],
        index: idx,
        rowItem: el.rowItem
      }
    })
    rows.sort((a, b) => a.top - b.top || (a.cells[0]?.original?.x || 0) - (b.cells[0]?.original?.x || 0))
    return { pageIndex: pi, rows, rowItem: els[0]?.rowItem }
  })
  attachTemplateRfid(pages, templateData)

  return {
    paperSize,
    columns: colAxis.columns,
    colBounds: colAxis.bounds,
    totalPages,
    pages
  }
}
