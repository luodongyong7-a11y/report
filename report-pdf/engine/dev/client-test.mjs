// 客户端冒烟:把「真实模板 + 真实数据」POST 到 sidecar /render,保存返回 PDF。
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '..', 'out')

const tpl = JSON.parse(fs.readFileSync(path.join(OUT, 'tpl-materialRequisition.json'), 'utf8'))
tpl.dataset = {
  ds1: [
    { item: null, po: null, order_quantity: null, material_code: '204404002228', material_name: '半光镍整平剂', material_spec: '25公斤/包', surface: null, unit_name: 'KG', snap_bom_dosage: null, requisition_quantity: '225.0000', actual_issued_quantity: '', remark: null },
    { item: null, po: null, order_quantity: null, material_code: '204404002229', material_name: '半光鎳电位差', material_spec: '25公斤/包', surface: null, unit_name: 'KG', snap_bom_dosage: null, requisition_quantity: '125.0000', actual_issued_quantity: '', remark: null }
  ],
  ds2: [
    { id: 'LL20260615000304', requesting_dept: '资讯课/Bộ phận CNTT (Công nghệ thông tin)', issuing_dept: '资材课/Bộ phận Vật tư', create_time: '2026-06-15T08:01:44.000Z', print_count: 0 }
  ]
}

const body = Buffer.from(JSON.stringify(tpl), 'utf8')
const PORT = Number(process.env.PORT || 7321)
const req = http.request({ host: '127.0.0.1', port: PORT, path: '/render', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': body.length } }, res => {
  const chunks = []
  res.on('data', c => chunks.push(c))
  res.on('end', () => {
    const buf = Buffer.concat(chunks)
    if (res.statusCode === 200) {
      const out = path.join(OUT, 'served-materialRequisition.pdf')
      fs.writeFileSync(out, buf)
      console.log(`OK ${res.statusCode}  pages=${res.headers['x-report-pages']}  elements=${res.headers['x-report-elements']}  ${res.headers['x-report-ms']}ms  ${buf.length}B`)
      console.log('saved:', out)
    } else {
      console.log(`ERR ${res.statusCode}: ${buf.toString('utf8')}`)
    }
  })
})
req.on('error', e => console.log('request error:', e.message))
req.write(body)
req.end()
