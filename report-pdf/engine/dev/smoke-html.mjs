// HTML 预览冒烟:与 smoke.mjs 同构样例,断言含 report-page / @font-face / 关键文本。
import '../fonts.mjs'
import { renderTemplateToHtmlBuffer } from '../render.mjs'
import { fontRegistration } from '../fonts.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', '..', 'out')
fs.mkdirSync(OUT_DIR, { recursive: true })

const LAYOUT = { headerY: 120, summaryA: 980, summaryB: 1000, footerY: 1060 }
const PAPER = { width: 794, height: 1123 }

const COLS = [
  { key: 'batch', x: 40, w: 90, align: 'center', head: '批次 / Lô', merge: { mergeMode: 'first', mergeGroupBy: 'ds1.batch', mergeVerticalAlign: 'center' } },
  { key: 'code', x: 130, w: 110, align: 'left', head: '物料编码 / Mã' },
  { key: 'name', x: 240, w: 300, align: 'left', head: '物料名称 / Tên vật tư' },
  { key: 'qty', x: 540, w: 90, align: 'right', head: '数量 / SL' },
  { key: 'unit', x: 630, w: 124, align: 'center', head: '单位 / ĐVT' }
]

function headerElements () {
  const els = []
  els.push({
    id: 'barcode', type: 'barcode', x: 40, y: 14, width: 220, height: 48,
    content: 'LSX2026-0001'
  })
  els.push({
    id: 'qrcode', type: 'qrcode', x: 682, y: 14, width: 72, height: 72,
    content: '物料领用单 ${title}'
  })
  els.push({
    id: 'title', type: 'text', x: 270, y: 26, width: 400, height: 40,
    content: '物料领用单\nPhiếu xuất kho — ${title}',
    textAlign: 'center', style: { fontSize: 18 }
  })
  for (const c of COLS) {
    els.push({
      id: `h_${c.key}`, type: 'text', x: c.x, y: 90, width: c.w, height: 28,
      content: c.head, textAlign: 'center', groupId: 'colhead',
      border: { width: 1 }, style: { backgroundColor: '#f0f0f0' }
    })
  }
  return els
}

function dataRowElements () {
  return COLS.map(c => ({
    id: `d_${c.key}`, type: 'data', x: c.x, y: 120, width: c.w, height: 24,
    content: `\${ds1.${c.key}}`, textAlign: c.align, groupId: 'row',
    border: { width: 1 },
    ...(c.merge || {})
  }))
}

function summaryAndFooterElements () {
  return [
    { id: 'total_label', type: 'text', x: 40, y: 1012, width: 480, height: 24, content: '合计数量 / Tổng số lượng:', textAlign: 'right' },
    { id: 'total_value', type: 'text', x: 520, y: 1012, width: 110, height: 24, content: '${sum(ds1.qty)}', textAlign: 'right', border: { width: 1 }, formatType: 'number', numberFormat: 'fixed2' },
    { id: 'pageno', type: 'text', x: 40, y: 1078, width: 714, height: 20, content: '第 ${page} / ${total} 页 — Trang ${page}/${total}', textAlign: 'center', style: { fontSize: 10 } }
  ]
}

const NAME_SAMPLES = [
  '螺栓 Bu lông',
  '不锈钢内六角螺栓 M8x40 镀锌 / Bu lông lục giác chìm',
  '垫圈 Vòng đệm phẳng inox 304'
]
const UNITS = ['个 / Cái', '套 / Bộ', '件 / Chiếc']

function buildItems (n) {
  const items = []
  for (let i = 0; i < n; i++) {
    items.push({
      batch: `LO-${String(Math.floor(i / 6)).padStart(2, '0')}`,
      code: `BL-${String(1000 + i)}-Zn`,
      name: NAME_SAMPLES[i % NAME_SAMPLES.length],
      qty: (Math.round((i + 1) * 12.5 * 100) / 100).toFixed(2),
      unit: UNITS[i % UNITS.length]
    })
  }
  return items
}

const ROW_COUNT = Number(process.argv[2] || 24)

const templateData = {
  schemaVersion: 1,
  paperSize: PAPER,
  ...LAYOUT,
  elements: [...headerElements(), ...dataRowElements(), ...summaryAndFooterElements()],
  dataset: {
    title: '2026-0001',
    ds1: buildItems(ROW_COUNT)
  }
}

console.log('字体注册:', Object.entries(fontRegistration).map(([k, v]) => `${k}=${v.registered ? 'OK' : 'MISS'}`).join(' '))
console.log(`数据行数: ${ROW_COUNT}`)

const { buffer, totalPages, pageCount, elementCount } = await renderTemplateToHtmlBuffer(templateData)
const html = buffer.toString('utf8')
const outPath = path.join(OUT_DIR, 'engine-sample.html')
fs.writeFileSync(outPath, buffer)

const checks = [
  ['DOCTYPE', html.includes('<!DOCTYPE html>')],
  ['report-page', html.includes('class="report-page"')],
  ['@font-face', html.includes('@font-face')],
  ['title text', html.includes('物料领用单')],
  ['data code', html.includes('BL-1000-Zn')],
  ['report-html-root', html.includes('class="report-html-root"')],
  ['absolute lines', html.includes('report-cell__line')]
]
const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'}  ${name}`)
}
if (failed.length) {
  console.error(`HTML smoke failed: ${failed.map(([n]) => n).join(', ')}`)
  process.exit(1)
}

console.log(`\n展开元素实例数: ${elementCount}`)
console.log(`页数: ${pageCount}  (totalPages=${totalPages})`)
console.log(`输出: ${outPath}  (${buffer.length} bytes)`)
