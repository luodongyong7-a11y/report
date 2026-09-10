// orderChange 双表 prevNodeId 级联冒烟:变更前(ds3)扩完后再排变更后(ds2),不得按 index 混行。
import fs from 'node:fs'
import { buildFlowModel } from '../../../packages/report-core/src/layout/flow.js'

const tplPath = process.argv[2] || 'd:/tk-report/tmp-orderChange.json'
const t = JSON.parse(fs.readFileSync(tplPath, 'utf8'))
t.dataset = {
  ds1: {
    delivery_date_before: '2026-01-01',
    remark_before: 'before remark',
    delivery_date: '2026-02-01',
    remark: 'after remark',
    approver: 'A',
    creator: 'B'
  },
  ds3: Array.from({ length: 3 }, (_, i) => ({
    serial_number: String(i + 1),
    product_code: 'P' + i,
    po: 'PO' + i,
    po_customer: 'CPO' + i,
    item_model: 'IM' + i,
    item_customer: 'IC' + i,
    product_name: 'N' + i,
    quantity: i + 1,
    packing_quantity: 1,
    surface: 'S',
    remark: 'r'
  })),
  ds2: Array.from({ length: 5 }, (_, i) => ({
    serial_number: String(i + 1),
    product_code: 'Q' + i,
    po: 'POA' + i,
    po_customer: 'CPOA' + i,
    item_model: 'IMA' + i,
    item_customer: 'ICA' + i,
    product_name: 'NA' + i,
    quantity: i + 10,
    packing_quantity: 2,
    surface: 'SA',
    remark: 'ra'
  }))
}

const measureCell = (el) => ({ boxHeight: el.height || 20 })
const model = buildFlowModel(t, { measureCell })
const detail = model.pages.flatMap(p => p.rows.filter(r => r.band === 'detail'))

function rowMeta (r) {
  const ys = [...new Set(r.cells.map(c => c.original.y))].sort((a, b) => a - b)
  const dss = [...new Set(r.cells.map(c => {
    const m = String(c.original.content || '').match(/ds[123]/)
    return m ? m[0] : null
  }).filter(Boolean))]
  return { top: r.top, h: r.height, index: r.index, ys, dss, n: r.cells.length }
}

console.log('totalPages', model.totalPages, 'detailRows', detail.length)
for (const r of detail) console.log(rowMeta(r))

const mixed = detail.filter(r => {
  const dss = new Set(r.cells.map(c => {
    const m = String(c.original.content || '').match(/ds[123]/)
    return m ? m[0] : null
  }).filter(Boolean))
  return dss.has('ds2') && dss.has('ds3')
})
if (mixed.length) {
  throw new Error('ds2/ds3 mixed in same logical row: ' + JSON.stringify(mixed.map(rowMeta)))
}

const titleBefore = detail.find(r => r.cells.some(c => String(c.content).includes('变更前')))
const titleAfter = detail.find(r => r.cells.some(c => String(c.content).includes('变更后')))
const ds3Rows = detail.filter(r => r.cells.some(c => /\$\{ds3\./.test(c.original.content || '')))
const ds2Rows = detail.filter(r => r.cells.some(c => /\$\{ds2\./.test(c.original.content || '')))

if (!titleBefore || !titleAfter) throw new Error('missing 变更前/变更后 titles')
if (ds3Rows.length !== 3) throw new Error('expected 3 ds3 rows, got ' + ds3Rows.length)
if (ds2Rows.length !== 5) throw new Error('expected 5 ds2 rows, got ' + ds2Rows.length)

const ds3Bottom = Math.max(...ds3Rows.map(r => r.top + r.height))
if (titleAfter.top < ds3Bottom) {
  throw new Error(`变更后叠在变更前上: after.top=${titleAfter.top} ds3Bottom=${ds3Bottom}`)
}
const ds2Top = Math.min(...ds2Rows.map(r => r.top))
if (ds2Top < titleAfter.top + titleAfter.height) {
  throw new Error(`ds2 未落在变更后标题下: ds2Top=${ds2Top} titleAfterBottom=${titleAfter.top + titleAfter.height}`)
}

console.log('OK: orderChange prevNode dual-table cascade')
