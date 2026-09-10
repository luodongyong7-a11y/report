// 流式引擎验证:加载模板 → 注入样例数据(真实模板)→ 构建 flow 模型并 dump 列/每页行/单元格,
// 再用 flow 版 Excel 导出并回读,核对「1 数据行=1 Excel 行、列对齐、合计/页码、签名网格不被打散」。
// 用法:node engine/test-flow.mjs [模板文件.json] [数据行数]
import '../fonts.mjs'
import ExcelJS from 'exceljs'
import { buildFlowModel } from '../flow.mjs'
import { buildXlsxBufferFromFlow } from '../draw-xlsx-flow.mjs'
import { renderTemplateToPdfFlowBuffer } from '../render-flow.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '..', 'out')
const file = process.argv[2] || 'real-order.json'
const rowCount = Number(process.argv[3] || 14)
const tpl = JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf8'))

// 真实模板 dataset 是 SQL 定义对象;注入样例数组(字段取各模板并集,同 test-real.mjs)。
function injectSampleData (t) {
  if (Array.isArray(t.dataset && t.dataset.ds1)) return // 已是数据(如 engine-sample-template)
  t.dataset = {
    title: '2026-0001',
    ds1: [{
      task_id: 'PO-2026-0001', id: 'OT20260629000001', supplier_name: '某某供应商有限公司',
      customer_name: '某某客户有限责任公司', create_time: '2026-06-29', print_count: 2,
      remark: '交货备注:请按图纸要求执行,分批交付', approver: '张三', creator: '李四', confirmer: '王五'
    }],
    ds2: Array.from({ length: rowCount }, (_, i) => ({
      code: 'MAT-' + (1000 + i), snap_product_code: 'P-' + (2000 + i),
      name: '不锈钢内六角螺栓 M8x40 镀锌 表面处理', snap_product_name: '产品名称示例A',
      model: 'M8x40', snap_product_model: 'MODEL-X', product_model_customer: 'CUST-M',
      po: 'PO' + (500 + i), po_customer: 'CPO' + i,
      spec: 'M8x40 镀锌', surface: '镀锌', unit_name: '个',
      quantity: (i + 1) * 10, packing_quantity: (i + 1), received_quantity: (i + 1) * 10,
      purchase_quantity: (i + 1) * 10, delivery_date: '2026-07-1' + (i % 9), remark: '备注' + i,
      batch: 'LO-' + String(Math.floor(i / 6)).padStart(2, '0')
    }))
  }
}

injectSampleData(tpl)

const model = buildFlowModel(tpl)

console.log('=== 模板:', file, ' 纸张:', JSON.stringify(model.paperSize), ' ===')
console.log('列数:', model.columns.length, ' 列边界:', JSON.stringify(model.colBounds))
console.log('列宽:', JSON.stringify(model.columns.map(c => c.width)))
console.log('[SUM] cols=' + model.columns.length + ' pages=' + model.totalPages)

const bandTag = { header: 'H', detail: 'D', summary: 'S', summaryBToFooter: 'B', footer: 'F' }
for (const pg of model.pages) {
  const counts = {}
  for (const row of pg.rows) counts[row.band] = (counts[row.band] || 0) + 1
  console.log(`\n--- 第 ${pg.pageIndex + 1} 页  行数=${pg.rows.length}  ${JSON.stringify(counts)} ---`)
  for (const row of pg.rows) {
    const cells = row.cells.map(c => {
      const span = c.colStart === c.colEnd ? `c${c.colStart}` : `c${c.colStart}-${c.colEnd}`
      const rs = c.rowSpan > 1 ? `x${c.rowSpan}` : ''
      const txt = String(c.content == null ? '' : c.content).replace(/\n/g, '⏎').slice(0, 20)
      const media = c.isMedia ? `[${c.type}]` : ''
      return `${span}${rs}${media}=${JSON.stringify(txt)}`
    })
    console.log(`  ${bandTag[row.band] || '?'} y${Math.round(row.top)} h${Math.round(row.height)} | ${cells.join('  ')}`)
  }
}

// flow 版 Excel 导出 + 回读
const outXlsx = path.join(OUT, file.replace('.json', '.flow.xlsx'))
const res = await buildXlsxBufferFromFlow(model)
fs.writeFileSync(outXlsx, res.buffer)
console.log('\n=== Excel 导出:', path.basename(outXlsx), ` (${res.buffer.length} bytes) ===`)

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(outXlsx)
const ws = wb.getWorksheet('report')
const merges = ws.model.merges ? ws.model.merges.length : 0
const images = (ws.getImages ? ws.getImages() : []).length
console.log(`[READBACK] rows=${ws.actualRowCount} cols=${ws.actualColumnCount} merges=${merges} images=${images}`)
console.log('合并区:', JSON.stringify((ws.model.merges || []).slice(0, 40)))

// 同源 flow PDF(供并排比对保真度)
const outPdf = path.join(OUT, file.replace('.json', '.flow.pdf'))
const pdfRes = await renderTemplateToPdfFlowBuffer(tpl)
fs.writeFileSync(outPdf, pdfRes.buffer)
console.log('[PDF] ' + path.basename(outPdf) + ' pages=' + pdfRes.pageCount + ' bytes=' + pdfRes.buffer.length)
