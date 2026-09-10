// 用真实模板 + 注入样例数据本地验证 Excel 导出结构(dump 每行单元格,检查缺失/堆叠/列对齐)。
import '../fonts.mjs'
import ExcelJS from 'exceljs'
import { renderTemplateToXlsx, renderTemplateToPdf } from '../render.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '..', 'out')
const file = process.argv[2] || 'real-deliveryNote.json'
const t = JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf8'))

// 注入样例数据(模拟后端 buildRenderTemplate 填数:dataset.dsN 为数组)。字段取各模板并集。
t.dataset = {
  ds1: [{
    task_id: 'PO-2026-0001', id: 'OT20260629000001', supplier_name: '某某供应商有限公司',
    customer_name: '某某客户有限责任公司', create_time: '2026-06-29', print_count: 2,
    remark: '交货备注:请按图纸要求执行', approver: '张三', creator: '李四', confirmer: '王五'
  }],
  ds2: Array.from({ length: 14 }, (_, i) => ({
    code: 'MAT-' + (1000 + i), snap_product_code: 'P-' + (2000 + i),
    name: '不锈钢内六角螺栓 M8x40 镀锌 表面处理', snap_product_name: '产品名称示例A',
    model: 'M8x40', snap_product_model: 'MODEL-X', product_model_customer: 'CUST-M',
    po: 'PO' + (500 + i), po_customer: 'CPO' + i,
    spec: 'M8x40 镀锌', surface: '镀锌', unit_name: '个',
    quantity: (i + 1) * 10, packing_quantity: (i + 1), received_quantity: (i + 1) * 10,
    purchase_quantity: (i + 1) * 10, delivery_date: '2026-07-1' + (i % 9), remark: '备注' + i
  }))
}

const outXlsx = path.join(OUT, file.replace('.json', '.xlsx'))
const res = await renderTemplateToXlsx(t, outXlsx)
console.log('render:', JSON.stringify(res))

// 同数据渲染 PDF,便于并排比对保真度
const outPdf = path.join(OUT, file.replace('.json', '-pdf.pdf'))
const pres = await renderTemplateToPdf(t, outPdf)
console.log('pdf:', JSON.stringify({ pages: pres.pageCount, bytes: pres.bytes }))

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(outXlsx)
const ws = wb.getWorksheet('report')
console.log('cols=' + ws.actualColumnCount + ' rows=' + ws.actualRowCount + ' merges=' + (ws.model.merges ? ws.model.merges.length : 0))
console.log('merges:', JSON.stringify(ws.model.merges || []))
ws.eachRow({ includeEmpty: false }, (row, rn) => {
  const cells = []
  row.eachCell({ includeEmpty: false }, (c, cn) => {
    let v = c.value
    if (v && v.richText) v = v.richText.map(r => r.text).join('')
    if (v !== null && v !== undefined && v !== '') cells.push('c' + cn + '=' + JSON.stringify(String(v)).slice(0, 34))
  })
  if (cells.length) console.log('R' + rn + ' h' + Math.round(row.height || 0) + ' | ' + cells.join('  '))
})
