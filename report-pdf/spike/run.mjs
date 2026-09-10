// spike 主脚本:
//  1) 验证 Pretext 能在 Node(配 @napi-rs/canvas)跑起来
//  2) 探查 @napi-rs/canvas 的字体度量字段,确定 normal 行高来源
//  3) 量宽 == 画宽:@napi-rs/canvas measureText vs pdfkit widthOfString
//  4) Pretext 算高,并生成 offset-probe.html 供浏览器交叉验证 offsetHeight
import './shim.mjs'
import { FONT_PATHS, REPORT_FONT_SIZE_PX, REPORT_TEXT_PADDING_PX, fontRegistration, createCanvas, GlobalFonts } from './shim.mjs'
import { prepare, layout } from '@chenglou/pretext'
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
// 报表 canonical 字体栈(用已注册的家族名;对齐 reportElementStyle.REPORT_DEFAULT_FONT_FAMILY 的主力字体)
const FONT_STACK = '"Times New Roman", "SimSun"'
const FONT_STRING = `${SIZE}px ${FONT_STACK}`

function hr (title) { console.log('\n' + '='.repeat(72) + '\n' + title + '\n' + '='.repeat(72)) }
function pad (s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)) }
function num (x, d = 2) { return Number(x).toFixed(d) }

// ---- 0. 字体注册情况 ----
hr('0. 字体注册 / GlobalFonts.families')
console.log(JSON.stringify(fontRegistration, null, 2))
try { console.log('families:', GlobalFonts.families.map(f => f.family).join(' | ')) } catch (e) { console.log('families 读取失败:', e.message) }

// ---- 1. Pretext 冒烟 ----
hr('1. Pretext 冒烟(prepare + layout)')
let pretextOk = false
try {
  const p = prepare('Hello 世界 nguyên vật liệu', FONT_STRING, { whiteSpace: 'pre-wrap' })
  const r = layout(p, 120, 16)
  console.log('layout(120px, lh16) =>', JSON.stringify(r))
  pretextOk = true
  console.log('Pretext 在 Node 跑通 ✓')
} catch (e) {
  console.log('Pretext 运行失败 ✗:', e.stack || e.message)
}

// ---- 2. 度量字段探查(决定 normal 行高来源) ----
hr('2. @napi-rs/canvas measureText 字段(取 normal 行高)')
const measCanvas = createCanvas(8, 8)
const measCtx = measCanvas.getContext('2d')
function metricsFor (fontString, sample) {
  measCtx.font = fontString
  const m = measCtx.measureText(sample)
  return m
}
function normalLineHeight (fontString, sample) {
  const m = metricsFor(fontString, sample)
  const fb = (m.fontBoundingBoxAscent || 0) + (m.fontBoundingBoxDescent || 0)
  const ab = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0)
  const em = (m.emHeightAscent || 0) + (m.emHeightDescent || 0)
  return { fb, ab, em, raw: m }
}
for (const [label, fam, sample] of [
  ['Times', '"Times New Roman"', 'Ag1'],
  ['SimSun', '"SimSun"', '物Ag'],
  ['Stack', FONT_STACK, '物Ag'],
]) {
  const fs2 = `${SIZE}px ${fam}`
  const lh = normalLineHeight(fs2, sample)
  const keys = Object.keys(lh.raw || {})
  console.log(`\n[${label}] ${fs2}`)
  console.log('  字段:', keys.join(', '))
  console.log(`  fontBoundingBox(A+D)=${num(lh.fb)}  actualBoundingBox=${num(lh.ab)}  emHeight=${num(lh.em)}`)
  console.log(`  => 取 fontBoundingBox 作 normal 行高候选: ${num(lh.fb)} px (字号 ${SIZE} → 倍率 ${num(lh.fb / SIZE, 3)})`)
}

// ---- 3. 量宽 == 画宽 ----
hr('3. 量宽(@napi-rs/canvas) vs 画宽(pdfkit) —— 同字体同字号')
const measDoc = new PDFDocument({ autoFirstPage: false })
// pdfkit 注册:times 单 ttf;simsun 取 .ttc 的 SimSun 面
measDoc.registerFont('times', FONT_PATHS.times)
let simsunPdfOk = true
try { measDoc.registerFont('song', FONT_PATHS.simsun, 'SimSun') } catch (e) { simsunPdfOk = false; console.log('pdfkit 注册 simsun.ttc 失败:', e.message) }

function napiWidth (text, fam) { measCtx.font = `${SIZE}px ${fam}`; return measCtx.measureText(text).width }
function pdfkitWidth (text, fontKey) { measDoc.font(fontKey).fontSize(SIZE); return measDoc.widthOfString(text) }

const WIDTH_CASES = [
  ['EN 短', 'Material', '"Times New Roman"', 'times'],
  ['EN 长', 'Stainless steel hex bolt M8x40', '"Times New Roman"', 'times'],
  ['数字', '1,234,567.89', '"Times New Roman"', 'times'],
  ['越南文', 'Phieu xuat kho nguyen vat lieu', '"Times New Roman"', 'times'],
  ['越南文带声调', 'Đặng Thị Hương — Số lượng tồn kho', '"Times New Roman"', 'times'],
  ['中文', '物料领用单据', '"SimSun"', 'song'],
  ['中文长', '不锈钢内六角螺栓规格说明与备注信息', '"SimSun"', 'song'],
]
console.log(pad('用例', 16) + pad('napi量宽', 12) + pad('pdfkit画宽', 12) + pad('差', 9) + '差%')
console.log('-'.repeat(60))
let maxDiffPct = 0
for (const [label, text, fam, fontKey] of WIDTH_CASES) {
  if (fontKey === 'song' && !simsunPdfOk) { console.log(pad(label, 16) + '(pdfkit simsun 未加载,跳过)'); continue }
  const w1 = napiWidth(text, fam)
  const w2 = pdfkitWidth(text, fontKey)
  const diff = w2 - w1
  const pct = w1 ? Math.abs(diff) / w1 * 100 : 0
  if (pct > maxDiffPct) maxDiffPct = pct
  console.log(pad(label, 16) + pad(num(w1), 12) + pad(num(w2), 12) + pad(num(diff), 9) + num(pct, 2) + '%')
}
console.log(`\n最大宽度差: ${num(maxDiffPct, 2)}%  ${maxDiffPct < 1 ? '(<1%,量画一致性良好 ✓)' : '(偏大,需关注 ⚠)'}`)

// ---- 4. normal 行高候选 + Pretext 算高 + 生成 offset-probe.html ----
hr('4. normal 行高候选(napi vs pdfkit)')
function pdfkitLineHeight (fontKey) {
  measDoc.font(fontKey).fontSize(SIZE)
  return { noGap: measDoc.currentLineHeight(false), gap: measDoc.currentLineHeight(true) }
}
const FAM = { times: '"Times New Roman"', simsun: '"SimSun"' }
const LH = {
  times: { napiFb: normalLineHeight(`${SIZE}px ${FAM.times}`, 'Ag1').fb, pdf: pdfkitLineHeight('times') },
  simsun: { napiFb: normalLineHeight(`${SIZE}px ${FAM.simsun}`, '物Ag').fb, pdf: simsunPdfOk ? pdfkitLineHeight('song') : null },
}
console.log(`Times  : napi fontBoundingBox=${num(LH.times.napiFb)}  pdfkit noGap/gap=${num(LH.times.pdf.noGap)}/${num(LH.times.pdf.gap)}`)
console.log(`SimSun : napi fontBoundingBox=${num(LH.simsun.napiFb)}  pdfkit noGap/gap=${LH.simsun.pdf ? num(LH.simsun.pdf.noGap) + '/' + num(LH.simsun.pdf.gap) : 'n/a'}`)
console.log('注:浏览器 normal 行高需用 offset-probe.html 实测;这里两组候选用于和它对齐。')

hr('4b. Pretext 算高(pre-wrap, 按单元格字体取行高=napi fontBoundingBox)')
const HEIGHT_CELLS = [
  { label: '中文换行', font: 'simsun', text: '不锈钢内六角螺栓规格说明与备注信息含表面处理要求', boxWidth: 120 },
  { label: '越南文换行', font: 'times', text: 'Phiếu xuất kho nguyên vật liệu cho đơn hàng số 2026-0001', boxWidth: 120 },
  { label: 'EN 换行', font: 'times', text: 'Stainless steel hex bolt M8x40 zinc plated packed 100 pcs per box', boxWidth: 120 },
  { label: '显式换行', font: 'times', text: '第一行\n第二行\n第三行', boxWidth: 200 },
  { label: '单行短', font: 'simsun', text: '物料', boxWidth: 120 },
]
console.log(pad('单元格', 14) + pad('字体', 8) + pad('盒宽', 6) + pad('行高', 7) + pad('行数', 6) + pad('文本高', 9) + '预测盒高')
console.log('-'.repeat(66))
const predicted = {}
for (const c of HEIGHT_CELLS) {
  const fam = FAM[c.font]
  const lineH = LH[c.font].napiFb
  const fontStr = `${SIZE}px ${fam}`
  const contentW = c.boxWidth - 2 * PAD - 2 * BORDER
  const p = prepare(c.text, fontStr, { whiteSpace: 'pre-wrap' })
  const r = layout(p, contentW, lineH)
  const boxH = r.height + 2 * PAD + 2 * BORDER
  predicted[c.label] = { boxWidth: c.boxWidth, font: c.font, fam, lineHeight: lineH, lineCount: r.lineCount, textHeight: r.height, boxHeight: boxH }
  console.log(pad(c.label, 14) + pad(c.font, 8) + pad(c.boxWidth, 6) + pad(num(lineH), 7) + pad(r.lineCount, 6) + pad(num(r.height), 9) + num(boxH))
}

// 生成 offset-probe.html:每单元格用其字体,浏览器实测 offsetHeight,与 Pretext 预测并排对比
const cellsForHtml = HEIGHT_CELLS.map(c => ({ ...c, pretext: predicted[c.label] }))
const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>offset-probe: Pretext 预测 vs 浏览器 offsetHeight</title>
<style>
  body{font-family:Arial,system-ui,sans-serif;padding:16px;background:#f5f5f5}
  h1{font-size:16px}
  .note{color:#555;font-size:13px;margin-bottom:12px}
  table{border-collapse:collapse;background:#fff}
  th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px;text-align:right}
  th:first-child,td:first-child{text-align:left}
  .ok{color:#0a0}.warn{color:#c00;font-weight:bold}
  .cell{box-sizing:border-box;padding:${PAD}px;border:${BORDER}px solid #000;
    font-size:${SIZE}px;line-height:normal;
    white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;background:#fff;margin:4px 0}
  .stage{position:absolute;left:-9999px;top:0}
</style></head><body>
<h1>offset-probe —— Pretext 预测盒高 vs 浏览器实测 offsetHeight</h1>
<div class="note">字体栈 <code>${FONT_STACK.replace(/</g, '&lt;')}</code> · 字号 ${SIZE}px · line-height:normal · pre-wrap+break-word · padding ${PAD} · border ${BORDER}<br>
diff = 浏览器 offsetHeight − Pretext 预测盒高。越接近 0 越好(目标:整页累计不跨页)。</div>
<div id="stage" class="stage"></div>
<table id="t"><thead><tr><th>单元格</th><th>盒宽</th><th>Pretext 行数</th><th>Pretext 预测盒高</th><th>浏览器 offsetHeight</th><th>diff(px)</th></tr></thead><tbody></tbody></table>
<script>
const CELLS = ${JSON.stringify(cellsForHtml)};
const stage = document.getElementById('stage');
const tbody = document.querySelector('#t tbody');
for (const c of CELLS) {
  const d = document.createElement('div');
  d.className = 'cell';
  d.style.width = c.boxWidth + 'px';
  d.style.fontFamily = c.pretext.fam;
  d.textContent = c.text;
  stage.appendChild(d);
  const off = d.offsetHeight;
  const pred = c.pretext.boxHeight;
  const diff = off - pred;
  const tr = document.createElement('tr');
  const cls = Math.abs(diff) <= 1 ? 'ok' : 'warn';
  tr.innerHTML = '<td>'+c.label+'</td><td>'+c.boxWidth+'</td><td>'+c.pretext.lineCount+'</td><td>'+pred.toFixed(2)+'</td><td>'+off+'</td><td class="'+cls+'">'+diff.toFixed(2)+'</td>';
  tbody.appendChild(tr);
}
</script>
</body></html>`
const probePath = path.join(OUT_DIR, 'offset-probe.html')
fs.writeFileSync(probePath, html, 'utf8')
console.log(`\n已生成 ${probePath}`)
console.log('→ 在 Chrome/Edge 打开它,看 diff 列(浏览器 offsetHeight − Pretext 预测盒高)。')

console.log('\n完成。Pretext 可用=' + pretextOk + '  simsun(pdfkit)=' + simsunPdfOk)
