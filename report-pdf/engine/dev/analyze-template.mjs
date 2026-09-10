// 分析模板结构:打印分带边界 + 各带元素(按 y,x 排序,含坐标/类型/内容),便于定位版式问题。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '..', 'out')
const t = JSON.parse(fs.readFileSync(path.join(OUT, process.argv[2] || 'real-order.json'), 'utf8'))
console.log('paper', JSON.stringify(t.paperSize), 'headerY', t.headerY, 'summaryA', t.summaryA, 'summaryB', t.summaryB, 'footerY', t.footerY)
const band = (y) => {
  y = y || 0
  if (y < t.headerY) return 'H'
  if (y >= t.footerY) return 'F'
  if (y >= t.summaryA && y < t.summaryB) return 'SA'
  if (y >= t.summaryB && y < t.footerY) return 'SBF'
  return 'D'
}
const els = (t.elements || []).map(e => ({
  band: band(e.y), y: e.y || 0, x: e.x || 0, w: e.width || 0, h: e.height || 0,
  type: e.type, id: (e.id || '').slice(-6),
  c: String(e.content || '').replace(/\n/g, '\\n').slice(0, 40)
})).sort((a, b) => a.y - b.y || a.x - b.x)
for (const e of els) {
  console.log(`${e.band}\ty=${e.y}\tx=${e.x}\tw=${e.w}\th=${e.h}\t${e.type}\t[${e.id}]\t${e.c}`)
}
