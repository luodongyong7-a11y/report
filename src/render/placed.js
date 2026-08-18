import { buildFlowModel } from '../layout/index.js'
import { ensureReportSchemaVersion } from '../schema.js'
import { createMeasure } from './measure.js'

function placedY (row, original) {
  if (row.band === 'detail' || row.band === 'summaryBToFooter') return row.top
  const anchor = (row.anchorY != null ? row.anchorY : row.top)
  const designY = (original && typeof original.y === 'number') ? original.y : anchor
  return row.top + (designY - anchor)
}

/** flow 行模型摊成绝对坐标页，供 HTML / PDF 画。 */
export function flowToPlacedPages (model) {
  const { colBounds, pages } = model
  return pages.map(pg => {
    const elements = []
    for (const row of pg.rows) {
      for (const cell of row.cells) {
        const o = cell.original || {}
        const x = (typeof o.x === 'number') ? o.x : colBounds[cell.colStart - 1]
        const width = (typeof o.width === 'number') ? o.width : (colBounds[cell.colEnd] - colBounds[cell.colStart - 1])
        let height
        if (cell.rowSpan > 1 && cell.mergedHeight) height = cell.mergedHeight
        else if (row.band === 'detail') height = row.height
        else height = (cell.ownHeight != null ? cell.ownHeight : row.height)
        elements.push({
          type: cell.type,
          x,
          y: placedY(row, o),
          width,
          height,
          parsedContent: cell.content,
          textAlign: cell.textAlign,
          verticalAlign: cell.verticalAlign,
          shrinkToFit: cell.shrinkToFit === true || (o.shrinkToFit === true),
          border: cell.border,
          style: cell.style,
          fill: cell.fill,
          barcodeFormat: o.barcodeFormat || o.format,
          qrcodeFormat: o.qrcodeFormat,
          barcodeFit: o.barcodeFit,
          barcodeDisplayValue: o.barcodeDisplayValue === true || o.displayValue === true,
          barcodeRenderer: o.barcodeRenderer,
          barcodeBarHeight: o.barcodeBarHeight,
          barcodeGuardHeight: o.barcodeGuardHeight,
          barcodeFontSize: o.barcodeFontSize,
          barcodeSideFontSize: o.barcodeSideFontSize,
          barcodeHriScaleX: o.barcodeHriScaleX,
          barcodeSideScaleX: o.barcodeSideScaleX,
          barcodeHriDigits: o.barcodeHriDigits,
          barcodeBarsX: o.barcodeBarsX,
          barcodeInkRects: o.barcodeInkRects,
          barcodeInkContent: o.barcodeInkContent,
          barcodeTextMargin: o.barcodeTextMargin,
          barcodeMarginBottom: o.barcodeMarginBottom,
          barcodeFont: o.barcodeFont,
          barcodeModuleCssPx: o.barcodeModuleCssPx,
          padding: o.padding,
          content: o.content,
          original: o
        })
      }
    }
    return {
      pageIndex: pg.pageIndex,
      elements,
      epc: pg.epc || '',
      rowItem: pg.rowItem || null,
      paperSize: model.paperSize
    }
  })
}

export function normalizeTemplate (template, dataset) {
  const t = template && typeof template === 'object' ? { ...template } : {}
  if (!t.paperSize || typeof t.paperSize !== 'object') {
    t.paperSize = { width: 794, height: 1123 }
  }
  if (!Array.isArray(t.elements)) t.elements = []
  if (dataset != null) t.dataset = dataset
  else if (t.dataset == null) t.dataset = {}
  return ensureReportSchemaVersion(t)
}

/** 模板 + 数据集 → 分页后的绝对坐标页。 */
export function layoutReport (template, opts = {}) {
  const td = normalizeTemplate(template, opts.dataset)
  const own = typeof opts.measureCell === 'function'
    ? { measureCell: opts.measureCell, dispose () {} }
    : createMeasure(opts)
  try {
    const model = buildFlowModel(td, { measureCell: own.measureCell })
    const pages = flowToPlacedPages(model)
    return {
      model,
      pages,
      paperSize: model.paperSize,
      totalPages: model.totalPages
    }
  } finally {
    if (own.dispose) own.dispose()
  }
}
