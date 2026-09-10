// 流式引擎编排:模板(已填 dataset)→ flow 模型 → PDF / XLSX / HTML。PDF 与 XLSX / HTML 消费同一份 flow 模型,彻底一致。
// PDF 端把 flow 逻辑行按「列 x + 行 top」摊平成 placed 绝对坐标,复用现有 draw.mjs 逐单元格绘制
// (文本/边框/字体/媒体口径不变);页脚已在 flow 中按设计 y 定位,天然钉页底。
import './fonts.mjs'
import { buildFlowModel } from './flow.mjs'
import { buildXlsxBufferFromFlow } from './draw-xlsx-flow.mjs'
import { renderPagesToPdfBuffer } from './draw.mjs'
import { buildHtmlBuffer } from './draw-html.mjs'

// placed.y:
//  - detail / summaryBToFooter: layout 已算好绝对 top(含紧贴数据底、prev 级联),必须用 row.top。
//    SBF 行无 anchorY;若再按 designY-anchor 回拨,会把备注顶边拽回设计 y,压进合计行画出多余横线。
//  - header / summary / footer: 视觉行聚类共用 anchorY 时,保留各格相对锚点的设计 y 偏移
//    (成品出库:客户名 y=58 不被标题 y=50 拽走)。
function placedY (row, original) {
  if (row.band === 'detail' || row.band === 'summaryBToFooter') return row.top
  const anchor = (row.anchorY != null ? row.anchorY : row.top)
  const designY = (original && typeof original.y === 'number') ? original.y : anchor
  return row.top + (designY - anchor)
}

// flow 模型 → draw.mjs 可消费的 placed 绝对坐标页。rowSpan 单元格用合并区总高撑格。
export function flowToPlacedPages (model) {
  const { colBounds, pages } = model
  return pages.map(pg => {
    const elements = []
    for (const row of pg.rows) {
      for (const cell of row.cells) {
        // PDF/HTML 按模板精确坐标渲染(不吸附列网格);列网格仅供 Excel 下游量化。
        const o = cell.original || {}
        const x = (typeof o.x === 'number') ? o.x : colBounds[cell.colStart - 1]
        const width = (typeof o.width === 'number') ? o.width : (colBounds[cell.colEnd] - colBounds[cell.colStart - 1])
        // 高度:合并格用合并高;detail 数据行用统一行高(表格行等高);
        // 其余带用各自 ownHeight(汇总B→页脚已按内容自增高写入 actualHeight→ownHeight),
        // 避免同一视觉行内的高元素把矮格撑高、纵向盖住相邻行。
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
          shrinkToFit: cell.shrinkToFit === true || (cell.original && cell.original.shrinkToFit === true),
          border: cell.border,
          style: cell.style,
          fill: cell.fill,
          original: cell.original
        })
      }
    }
    return { pageIndex: pg.pageIndex, elements }
  })
}

export async function renderTemplateToPdfFlowBuffer (templateData, opts) {
  const model = buildFlowModel(templateData)
  const pages = flowToPlacedPages(model)
  const buffer = await renderPagesToPdfBuffer({ pages, paperSize: model.paperSize, watermark: !!(opts && opts.watermark) })
  let elementCount = 0
  for (const pg of pages) elementCount += pg.elements.length
  return { buffer, totalPages: model.totalPages, pageCount: pages.length, elementCount }
}

export async function renderTemplateToXlsxFlowBuffer (templateData) {
  const model = buildFlowModel(templateData)
  const res = await buildXlsxBufferFromFlow(model)
  return { buffer: res.buffer, totalPages: model.totalPages, pageCount: model.pages.length, elementCount: res.elementCount }
}

export async function renderTemplateToHtmlFlowBuffer (templateData, opts) {
  const model = buildFlowModel(templateData)
  const pages = flowToPlacedPages(model)
  const buffer = await buildHtmlBuffer({ pages, paperSize: model.paperSize, watermark: !!(opts && opts.watermark) })
  let elementCount = 0
  for (const pg of pages) elementCount += pg.elements.length
  return { buffer, totalPages: model.totalPages, pageCount: pages.length, elementCount }
}
