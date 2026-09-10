// 用真实模板 + 真实数据(从测试库跑 ds1/ds2 SQL 得到)端到端渲染,验证引擎对真实模板的兼容。
import '../fonts.mjs'
import { renderTemplateToPdf } from '../render.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '..', 'out')

const tpl = JSON.parse(fs.readFileSync(path.join(OUT, 'tpl-materialRequisition.json'), 'utf8'))

// requisition LL20260615000304 的真实查询结果(documentId 已代入)
tpl.dataset = {
  ds1: [
    { item: null, po: null, order_quantity: null, material_code: '204404002228', material_name: '半光镍整平剂', material_spec: '25公斤/包', surface: null, unit_name: 'KG', snap_bom_dosage: null, requisition_quantity: '225.0000', actual_issued_quantity: '', remark: null },
    { item: null, po: null, order_quantity: null, material_code: '204404002229', material_name: '半光鎳电位差', material_spec: '25公斤/包', surface: null, unit_name: 'KG', snap_bom_dosage: null, requisition_quantity: '125.0000', actual_issued_quantity: '', remark: null }
  ],
  ds2: [
    { id: 'LL20260615000304', requesting_dept: '资讯课/Bộ phận CNTT (Công nghệ thông tin)', issuing_dept: '资材课/Bộ phận Vật tư', create_time: '2026-06-15T08:01:44.000Z', print_count: 0 }
  ]
}

const outPath = path.join(OUT, 'real-materialRequisition.pdf')
const res = await renderTemplateToPdf(tpl, outPath)
console.log('paperSize:', JSON.stringify(tpl.paperSize))
console.log('ds1 rows:', tpl.dataset.ds1.length, ' ds2 rows:', tpl.dataset.ds2.length)
console.log('元素实例:', res.elementCount, ' 页数:', res.pageCount, ' 输出:', res.outPath, `(${res.bytes} bytes)`)
