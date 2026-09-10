// 样式自测样张:逐项验证设计器样式在边车 PDF 的 1:1 还原。
// 覆盖:真实加粗/斜体(Times)、合成加粗/斜体(中文宋体/黑体)、中英混排加粗、
//       彩色文字、下划线、删除线、虚线/点线边框、背景色+反白加粗。
// 运行:node engine/smoke-style.mjs  →  out/engine-style.pdf
//       node engine/rasterize.mjs out/engine-style.pdf 2  →  out/engine-style-p1.png
import '../fonts.mjs'
import { renderTemplateToPdf } from '../render.mjs'
import { fontRegistration } from '../fonts.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', '..', 'out')
fs.mkdirSync(OUT_DIR, { recursive: true })

const PAPER = { width: 794, height: 1123 }
// 全部落在「页眉区」(非数据区,固定高),不触发 dataset 展开。
const LAYOUT = { headerY: 2000, summaryA: 2000, summaryB: 2020, footerY: 2040 }

const X = 40
const W = 460
const H = 30
let y = 30
const row = (content, opts = {}) => {
  const el = {
    id: `s_${y}`, type: 'text', x: X, y, width: W, height: H,
    content, textAlign: opts.align || 'left',
    style: { fontSize: opts.fontSize || 16, ...(opts.style || {}) }
  }
  if (opts.border) el.border = opts.border
  y += H + 8
  return el
}

const elements = [
  row('Times 普通 Normal ABC abc 123 越南 đường'),
  row('Times 加粗 Bold ABC abc 123 (真实字面)', { style: { fontWeight: 'bold' } }),
  row('Times 斜体 Italic ABC abc 123 (真实字面)', { style: { fontStyle: 'italic' } }),
  row('Times 粗斜 BoldItalic ABC 123 (真实字面)', { style: { fontWeight: 'bold', fontStyle: 'italic' } }),
  row('中文宋体 普通 SimSun', { style: { fontFamily: 'SimSun' } }),
  row('中文宋体 加粗 SimSun (合成粗体)', { style: { fontFamily: 'SimSun', fontWeight: 'bold' } }),
  row('中文宋体 斜体 SimSun (合成斜体)', { style: { fontFamily: 'SimSun', fontStyle: 'italic' } }),
  row('中文黑体 加粗 SimHei (合成粗体)', { style: { fontFamily: 'SimHei', fontWeight: 'bold' } }),
  row('混排加粗 中文Bold + English Bold 123', { style: { fontWeight: 'bold' } }),
  row('彩色文字 Colored #1565c0', { style: { color: '#1565c0' } }),
  row('彩色加粗 Colored Bold #c62828', { style: { color: '#c62828', fontWeight: 'bold' } }),
  row('下划线 Underline 文本 abc', { style: { textDecoration: 'underline' } }),
  row('删除线 Line-through 文本 abc', { style: { textDecoration: 'line-through' } }),
  row('下划线+彩色 红色下划线', { style: { textDecoration: 'underline', color: '#c00' } }),
  row('实线边框 solid', { border: { width: 1, style: 'solid', color: '#333' } }),
  row('虚线边框 dashed', { border: { width: 1, style: 'dashed', color: '#333' } }),
  row('点线边框 dotted', { border: { width: 2, style: 'dotted', color: '#0a7d00' } }),
  row('反白加粗 背景色', { align: 'center', style: { backgroundColor: '#263238', color: '#ffffff', fontWeight: 'bold' } })
]

const templateData = {
  schemaVersion: 1,
  paperSize: PAPER,
  ...LAYOUT,
  elements,
  dataset: { ds1: [] }
}

const outPath = path.join(OUT_DIR, 'engine-style.pdf')
const tplPath = path.join(OUT_DIR, 'engine-style-template.json')
fs.writeFileSync(tplPath, JSON.stringify(templateData, null, 2), 'utf8')

console.log('字体注册:', Object.entries(fontRegistration).map(([k, v]) => `${k}=${v.registered ? 'OK' : 'MISS'}`).join(' '))
const res = await renderTemplateToPdf(templateData, outPath)
console.log(`样式项: ${elements.length}  页数: ${res.pageCount}  元素实例: ${res.elementCount}`)
console.log(`输出: ${res.outPath}  (${res.bytes} bytes)`)
