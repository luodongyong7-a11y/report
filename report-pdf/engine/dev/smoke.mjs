// 端到端冒烟:合成一张「物料领用单」模板 JSON(含多列数据行 + 页眉列头 + 合计 + 页码),
// 用确定性引擎(无浏览器)算出多页 PDF,打印分页统计。
import '../fonts.mjs'
import { renderTemplateToPdf } from '../render.mjs'
import { fontRegistration } from '../fonts.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', '..', 'out')
fs.mkdirSync(OUT_DIR, { recursive: true })

// ---- 版面边界 ----
const LAYOUT = { headerY: 120, summaryA: 980, summaryB: 1000, footerY: 1060 }
const PAPER = { width: 794, height: 1123 }

// ---- 列定义(数据行 + 列头共用 x/width) ----
// 数据集按真实约定命名 ds1,字段引用写 ${ds1.field}。
// batch 列演示纵向合并:每 6 行同批次,合并为一个跨行高单元格(mergeMode first)。
const COLS = [
  { key: 'batch', x: 40, w: 90, align: 'center', head: '批次 / Lô', merge: { mergeMode: 'first', mergeGroupBy: 'ds1.batch', mergeVerticalAlign: 'center' } },
  { key: 'code', x: 130, w: 110, align: 'left', head: '物料编码 / Mã' },
  { key: 'name', x: 240, w: 300, align: 'left', head: '物料名称 / Tên vật tư' },
  { key: 'qty', x: 540, w: 90, align: 'right', head: '数量 / SL' },
  { key: 'unit', x: 630, w: 124, align: 'center', head: '单位 / ĐVT' }
]

function headerElements () {
  const els = []
  // 条码(左上)+ 二维码(右上),每页重复
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
    // B→页脚:合计(末页,跟随数据上提)
    { id: 'total_label', type: 'text', x: 40, y: 1012, width: 480, height: 24, content: '合计数量 / Tổng số lượng:', textAlign: 'right' },
    { id: 'total_value', type: 'text', x: 520, y: 1012, width: 110, height: 24, content: '${sum(ds1.qty)}', textAlign: 'right', border: { width: 1 }, formatType: 'number', numberFormat: 'fixed2' },
    // 页脚:页码(每页重复)
    { id: 'pageno', type: 'text', x: 40, y: 1078, width: 714, height: 20, content: '第 ${page} / ${total} 页 — Trang ${page}/${total}', textAlign: 'center', style: { fontSize: 10 } }
  ]
}

// ---- 生成数据行(长短混排,强制多页与换行)----
const NAME_SAMPLES = [
  '螺栓 Bu lông',
  '不锈钢内六角螺栓 M8x40 镀锌 / Bu lông lục giác chìm',
  '不锈钢内六角螺栓 M8x40 镀锌 表面处理要求 / Bu lông lục giác chìm thép không gỉ mạ kẽm cho đơn hàng số 2026-0001 (đã duyệt)',
  '垫圈 Vòng đệm phẳng inox 304',
  '六角螺母 Đai ốc lục giác M8 thép không gỉ / 不锈钢六角螺母'
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

const ROW_COUNT = Number(process.argv[2] || 60)

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

const outPath = path.join(OUT_DIR, 'engine-sample.pdf')
const tplPath = path.join(OUT_DIR, 'engine-sample-template.json')
fs.writeFileSync(tplPath, JSON.stringify(templateData, null, 2), 'utf8')

console.log('字体注册:', Object.entries(fontRegistration).map(([k, v]) => `${k}=${v.registered ? 'OK' : 'MISS'}`).join(' '))
console.log(`数据行数: ${ROW_COUNT}`)

const res = await renderTemplateToPdf(templateData, outPath)
console.log(`\n展开元素实例数: ${res.elementCount}`)
console.log(`页数: ${res.pageCount}  (totalPages=${res.totalPages})`)
console.log(`输出: ${res.outPath}  (${res.bytes} bytes)`)
console.log(`模板: ${tplPath}`)
