// 样例 PDF(带字体回退):证明"Pretext 逐行布局 + pdfkit 按 run 回退绘制"链路。
// 关键:pdfkit 无自动字体回退,一段 text 只用一个字体。须按脚本把字符串切成 run
// (中文→SimSun、其余含越南文→Times),逐 run 用对应字体绘制;度量端走同一回退链。
import './shim.mjs'
import { FONT_PATHS, REPORT_FONT_SIZE_PX, REPORT_TEXT_PADDING_PX, createCanvas } from './shim.mjs'
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'
import PDFDocument from 'pdfkit'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'out')
fs.mkdirSync(OUT_DIR, { recursive: true })

const SIZE = REPORT_FONT_SIZE_PX
const PAD = REPORT_TEXT_PADDING_PX
const BORDER = 1
const PX2PT = 72 / 96
// Pretext 度量用字体栈(skia 逐字回退:中文落 SimSun,越南文/拉丁落 Times)
const FONT_STACK = '"Times New Roman", "SimSun"'

const doc = new PDFDocument({ size: [794 * PX2PT, 1123 * PX2PT], margin: 0 })
const outPath = path.join(OUT_DIR, 'sample.pdf')
doc.pipe(fs.createWriteStream(outPath))
doc.registerFont('times', FONT_PATHS.times)
doc.registerFont('song', FONT_PATHS.simsun, 'SimSun')
const PDF_FONT = { times: 'times', simsun: 'song' }

// 每字体含-lineGap 行高(=浏览器 normal),单位 px(SIZE 为 px 数值)
doc.font('times').fontSize(SIZE); const LG_TIMES = doc.currentLineHeight(true)
doc.font('song').fontSize(SIZE); const LG_SONG = doc.currentLineHeight(true)

// ---- 字体回退:按脚本切 run ----
function isCJK (cp) {
  return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
    (cp >= 0x3000 && cp <= 0x303F) || (cp >= 0xFF00 && cp <= 0xFFEF) ||
    (cp >= 0x2E80 && cp <= 0x2EFF) || (cp >= 0xF900 && cp <= 0xFAFF)
}
function splitRuns (text) {
  const runs = []
  let cur = null
  for (const ch of text) {
    const font = isCJK(ch.codePointAt(0)) ? 'simsun' : 'times'
    if (cur && cur.font === font) cur.text += ch
    else { cur = { font, text: ch }; runs.push(cur) }
  }
  return runs
}
function runWidthPt (run) { doc.font(PDF_FONT[run.font]).fontSize(SIZE * PX2PT); return doc.widthOfString(run.text) }
function lineWidthPt (line) { return splitRuns(line).reduce((s, r) => s + runWidthPt(r), 0) }
function usesSong (text) { return splitRuns(text).some(r => r.font === 'simsun') }

// 把一行按 run 逐段画(startXpt 已按对齐算好的左起点)
function drawLineRuns (line, startXpt, yTopPx) {
  let x = startXpt
  for (const run of splitRuns(line)) {
    doc.font(PDF_FONT[run.font]).fontSize(SIZE * PX2PT).fillColor('#000')
    doc.text(run.text, x, yTopPx * PX2PT, { lineBreak: false })
    x += doc.widthOfString(run.text)
  }
}

function drawCell ({ xPx, yPx, wPx, text, align = 'left', fill }) {
  const lineH = usesSong(text) ? Math.max(LG_TIMES, LG_SONG) : LG_TIMES
  const contentWPx = wPx - 2 * PAD - 2 * BORDER
  const prepared = prepareWithSegments(text, `${SIZE}px ${FONT_STACK}`, { whiteSpace: 'pre-wrap' })
  const res = layoutWithLines(prepared, contentWPx, lineH)
  const boxHPx = res.height + 2 * PAD + 2 * BORDER

  const x = xPx * PX2PT, y = yPx * PX2PT, w = wPx * PX2PT, h = boxHPx * PX2PT
  if (fill) { doc.save(); doc.rect(x, y, w, h).fill(fill); doc.restore() }
  doc.lineWidth(BORDER * PX2PT).rect(x, y, w, h).stroke('#000')

  const contentLeftPt = (xPx + BORDER + PAD) * PX2PT
  const contentRightPt = (xPx + wPx - BORDER - PAD) * PX2PT
  const contentTopPx = yPx + BORDER + PAD
  res.lines.forEach((ln, i) => {
    const wPt = lineWidthPt(ln.text)
    let startXpt
    if (align === 'right') startXpt = contentRightPt - wPt
    else if (align === 'center') startXpt = contentLeftPt + ((contentRightPt - contentLeftPt) - wPt) / 2
    else startXpt = contentLeftPt
    drawLineRuns(ln.text, startXpt, contentTopPx + i * lineH)
  })
  return boxHPx
}

function barcodePng (wPx, hPx, seed) {
  const cv = createCanvas(wPx, hPx)
  const ctx = cv.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, wPx, hPx)
  ctx.fillStyle = '#000'
  let x = 4, s = seed
  while (x < wPx - 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const bw = 1 + (s % 4)
    if ((s >> 3) & 1) ctx.fillRect(x, 4, bw, hPx - 8)
    x += bw + 1
  }
  return cv.toBuffer('image/png')
}

// ---- 排一页 ----
// 标题(走回退,使中文不再豆腐)
const titleH = LG_TIMES
{
  const line = 'tk-erp 报表后端 PDF 渲染 — spike 样张(字体回退版)'
  drawLineRunsAt(line, 40, 16, 16)
}
function drawLineRunsAt (line, xPx, yTopPx, sizePx) {
  let x = xPx * PX2PT
  for (const run of splitRuns(line)) {
    doc.font(PDF_FONT[run.font]).fontSize(sizePx * PX2PT).fillColor('#000')
    doc.text(run.text, x, yTopPx * PX2PT, { lineBreak: false })
    x += doc.widthOfString(run.text)
  }
}

let y = 44
drawCell({ xPx: 40, yPx: y, wPx: 120, text: '物料编码', align: 'center', fill: '#f0f0f0' })
drawCell({ xPx: 159, yPx: y, wPx: 260, text: '物料名称 / Tên vật tư', align: 'center', fill: '#f0f0f0' })
drawCell({ xPx: 418, yPx: y, wPx: 90, text: '数量', align: 'center', fill: '#f0f0f0' })
y += 22

drawCell({ xPx: 40, yPx: y, wPx: 120, text: 'BL-M8x40-Zn', align: 'left' })
drawCell({ xPx: 159, yPx: y, wPx: 260, text: '不锈钢内六角螺栓 M8x40 镀锌 / Bu lông lục giác chìm thép không gỉ', align: 'left' })
drawCell({ xPx: 418, yPx: y, wPx: 90, text: '1,234.00', align: 'right' })
y += 52

drawCell({ xPx: 40, yPx: y, wPx: 120, text: 'PKG-CARTON', align: 'left' })
drawCell({ xPx: 159, yPx: y, wPx: 260, text: 'Phiếu xuất kho nguyên vật liệu cho đơn hàng số 2026-0001 (đã duyệt)', align: 'left' })
drawCell({ xPx: 418, yPx: y, wPx: 90, text: '56,789.50', align: 'right' })
y += 58

const bc = barcodePng(240, 48, 7)
doc.lineWidth(BORDER * PX2PT).rect(40 * PX2PT, y * PX2PT, 240 * PX2PT, 56 * PX2PT).stroke('#000')
doc.image(bc, (40 + PAD) * PX2PT, (y + PAD) * PX2PT, { width: (240 - 2 * PAD) * PX2PT, height: (56 - 2 * PAD) * PX2PT })
drawLineRunsAt('条码占位(canvas→PNG→pdfkit.image)', 290, y + 20, 9)

doc.end()
setTimeout(() => {
  const sz = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0
  console.log(`已生成 ${outPath}  (${sz} bytes)`)
  console.log(`行高: Times(含gap)=${LG_TIMES.toFixed(2)}  SimSun(含gap)=${LG_SONG.toFixed(2)}`)
  console.log('用 PDF 阅读器重开核对:标题中文不再豆腐、SimSun 单元格里的越南文声调完整。')
}, 600)
