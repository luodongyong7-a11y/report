// 度量基座:行高比率、字体回退切 run、napi 宽度。
// 必须在 import 本模块前先 import ./fonts.mjs(垫片与字体注册)。
import './fonts.mjs'
import { FONT_FAMILY, FONT_PATHS, createCanvas, glyphHas, browserNormalLineHeightRatio, resolveFace, fontRegistration } from './fonts.mjs'
import fs from 'node:fs'

// px 与 pt 换算(96dpi CSS px ↔ 72dpi PDF pt)
export const PX2PT = 72 / 96

// ---- 行高比率(normal 行高来源)----
// 优先 OS/2 win(= Windows Chrome normal);其次 napi fontBoundingBox(与 @napi-rs/canvas
// 绘制墨迹同源);不再回退 pdfkit。
const REF_SIZE = 100
let songOk = false
try { songOk = fs.existsSync(FONT_PATHS.simsun) && Boolean(fontRegistration.simsun && fontRegistration.simsun.registered) } catch { songOk = false }

const ratioMeasCanvas = createCanvas(8, 8)
const ratioMeasCtx = ratioMeasCanvas.getContext('2d')
function napiFontBoundingRatio (family) {
  ratioMeasCtx.font = `${REF_SIZE}px "${family}"`
  const m = ratioMeasCtx.measureText('Ag物')
  const h = (m.fontBoundingBoxAscent || 0) + (m.fontBoundingBoxDescent || 0)
  return h > 0 ? h / REF_SIZE : null
}
function resolveLineHeightRatio (fontKey, napiFamily, fallback) {
  const os = browserNormalLineHeightRatio(fontKey)
  if (os != null && os > 0) return os
  const fb = napiFontBoundingRatio(napiFamily)
  if (fb != null && fb > 0) return fb
  return fallback != null ? fallback : 1.2
}

const timesRatio = resolveLineHeightRatio('times', FONT_FAMILY.times)
const songRatio = songOk
  ? resolveLineHeightRatio('song', FONT_FAMILY.song, timesRatio)
  : timesRatio

export const LINE_HEIGHT_RATIO = {
  times: timesRatio,
  song: songRatio,
  hei: resolveLineHeightRatio('hei', FONT_FAMILY.hei, songRatio)
}

// ---- 字体回退:按脚本切 run ----
// pdfkit 无自动回退,一段 text 只用一个字体。中文(CJK)落 SimSun,其余(拉丁/越南文)落 Times。
// 度量端(napi)与绘制端(pdfkit)走同一条回退链,保证测画一致。
export function isCJK (cp) {
  return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
    (cp >= 0x3000 && cp <= 0x303F) || (cp >= 0xFF00 && cp <= 0xFFEF) ||
    (cp >= 0x2E80 && cp <= 0x2EFF) || (cp >= 0xF900 && cp <= 0xFAFF)
}

// 按字形覆盖回退:CJK 落 song;否则谁有该字形用谁(times 优先,其次 song、hei);都没有则退回 times。
// 这样越南文/拉丁走 times,汉字/全角符号走 song,times 缺失的符号(如某些几何符号)落到含字形的字体,
// 避免 pdfkit 用名义 advance 排版、渲染器却 fallback 出不同宽字形导致的 run 错位重叠。
// primary 为元素选定的主字体 key(times/song/hei,来自 fontKeyForFamily):
//  - 中文:选黑体走 hei,否则一律 song(SimSun)
//  - 西文/符号:优先用主字体(若含该字形,如选 SimSun 时西文也走 SimSun),再按 times、song、symbol、hei 回退
export function fontKeyForChar (ch, primary) {
  const cp = ch.codePointAt(0)
  if (isCJK(cp)) {
    if (primary === 'hei' && glyphHas('hei', cp)) return 'hei'
    return 'song'
  }
  if (primary && glyphHas(primary, cp)) return primary
  if (glyphHas('times', cp)) return 'times'
  if (glyphHas('song', cp)) return 'song'
  // 几何/勾选符号(▢ ☑ 等 times/song 都缺)落 Segoe UI Symbol,与 Windows 浏览器 fallback 同款字形。
  if (glyphHas('symbol', cp)) return 'symbol'
  if (glyphHas('hei', cp)) return 'hei'
  return 'times'
}

// 缺字规范化:times/song/hei 三款内置字体都没有字形的「等价方框/几何符号」,统一替换为有字形的等价码点。
// 仅当原字符确实三字体皆缺时才替换,避免误改正常字符。根治模板中 ▢(U+25A2)被渲染器乱 fallback 的重叠。
const GLYPH_NORMALIZE = new Map([
  [0x25A2, 0x25A1], // ▢ → □ 圆角空方框 → 空方框
  [0x25A3, 0x25A1], // ▣ → □
  [0x2610, 0x25A1], // ☐ → □
  [0x2B1A, 0x25A1], // ⬚ → □
  [0x25FB, 0x25A1]  // ◻ → □
])

function isMissingInAllFonts (cp) {
  return !glyphHas('times', cp) && !glyphHas('song', cp) && !glyphHas('symbol', cp) && !glyphHas('hei', cp)
}

// 把内置字体缺失且有等价码点的符号规范化为有字形者。测量与绘制必须在同一入口统一调用,保证测画一致。
export function normalizeGlyphs (text) {
  const s = String(text)
  let out = ''
  let changed = false
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    const rep = GLYPH_NORMALIZE.get(cp)
    if (rep != null && isMissingInAllFonts(cp)) { out += String.fromCodePoint(rep); changed = true } else { out += ch }
  }
  return changed ? out : s
}

// splitRuns 结果缓存:同一 (primary, 文本) 的字体切分恒定,换行/测宽/绘制会对相同 token 反复切分。
// 返回的数组为只读消费(绘制/测宽/富文本均不改写 run),可安全共享缓存实例。上限防无界增长。
const RUN_SPLIT_CACHE_MAX = 200000
const runSplitCache = new Map()

// 把字符串按字体切成连续 run:[{ fontKey:'song'|'times'|'hei', text }]。primary 见 fontKeyForChar。
export function splitRuns (text, primary) {
  const s = String(text)
  const key = (primary || '') + '\u0000' + s
  const cached = runSplitCache.get(key)
  if (cached !== undefined) return cached
  const runs = []
  let cur = null
  for (const ch of s) {
    const fontKey = fontKeyForChar(ch, primary)
    if (cur && cur.fontKey === fontKey) cur.text += ch
    else { cur = { fontKey, text: ch }; runs.push(cur) }
  }
  if (runSplitCache.size >= RUN_SPLIT_CACHE_MAX) runSplitCache.clear()
  runSplitCache.set(key, runs)
  return runs
}

export function textContainsCJK (text) {
  for (const ch of String(text)) {
    if (isCJK(ch.codePointAt(0))) return true
  }
  return false
}

// 某一行的 normal 行高(px):strut 用主字体(primary,默认 times),行内含 CJK 时与中文字体行高取较大。
// 复刻浏览器 line box:含更高字形时行盒长高。primary='hei' 时中文用 SimHei 行高,否则用 SimSun。
export function lineHeightPx (lineText, fontSizePx, primary) {
  const primaryKey = (primary && LINE_HEIGHT_RATIO[primary]) ? primary : 'times'
  const base = LINE_HEIGHT_RATIO[primaryKey] * fontSizePx
  if (!textContainsCJK(lineText)) return base
  const cjkRatio = (primary === 'hei') ? LINE_HEIGHT_RATIO.hei : LINE_HEIGHT_RATIO.song
  return Math.max(base, cjkRatio * fontSizePx)
}

// ---- napi 宽度(布局权威)----
const measCanvas = createCanvas(8, 8)
const measCtx = measCanvas.getContext('2d')

// 度量缓存:同一 (字体, 字号, 文本) 的 measureText 宽度恒定。报表内海量重复文本
// (单位/表头/相同格式数值/单字)命中率极高,可省绝大多数 napi measureText 调用。
// 字体切换后必须清空(见 clearMeasureCaches),否则会用旧字体宽度。上限防无界增长。
const WIDTH_CACHE_MAX = 200000
const widthCache = new Map()
export function clearMeasureCaches () { widthCache.clear(); runSplitCache.clear() }

// 用 napi 测某段文本在指定字体/字号下的宽度(px)。family 传 FONT_FAMILY.* 值。
export function napiWidth (text, family, fontSizePx) {
  const s = String(text)
  const key = family + '\u0000' + fontSizePx + '\u0000' + s
  const hit = widthCache.get(key)
  if (hit !== undefined) return hit
  measCtx.font = `${fontSizePx}px "${family}"`
  const w = measCtx.measureText(s).width
  if (widthCache.size >= WIDTH_CACHE_MAX) widthCache.clear()
  widthCache.set(key, w)
  return w
}

// 一段(可能混排)文本的绘制宽度(px):按 run 切,每段用其字体测,求和。
// 与换行权威(napi)同源,用于绘制端对齐(右/居中)定位。primary 见 fontKeyForChar。
// bold/italic 为元素级样式:真实加粗/斜体字面按其自身别名测宽(advance 不同);
// 合成加粗(双描)、合成斜体(切变)均不改变水平 advance,故按基础字面别名测宽,与绘制端 napiWidth advance 同源。
export function runsWidthPx (text, fontSizePx, primary, bold, italic) {
  let w = 0
  for (const run of splitRuns(text, primary)) {
    const face = resolveFace(run.fontKey, bold, italic)
    w += napiWidth(run.text, face.napiAlias, fontSizePx)
  }
  return w
}

// ---- 换行(与绘制 / 浏览器同源)----
// 把一段(不含换行符)切成换行 token:CJK 单字、单个空白、连续拉丁/越南文「词」。
// 断点位置复刻浏览器 normal:CJK 字之间、空白处、词边界;长词在 wrap 时再按字符强断(break-word)。
function tokenizeForWrap (s) {
  const tokens = []
  let buf = ''
  const flush = () => { if (buf) { tokens.push(buf); buf = '' } }
  for (const ch of s) {
    if (isCJK(ch.codePointAt(0)) || /\s/.test(ch)) { flush(); tokens.push(ch) } else { buf += ch }
  }
  flush()
  return tokens
}

// 复刻前端 reportElementStyle 的换行口径:white-space:pre-wrap(保留 \n 与空格)+
// overflow-wrap/word-break:break-word(长词可在词内断)。宽度一律用 runsWidthPx(按 run 各自字体测),
// 与绘制端、浏览器的逐字符字体回退同源,杜绝「napi 单字体把中文测窄→该换不换→被裁/与预览换行点不一致」。
export function wrapTextByRuns (text, maxWidthPx, fontSizePx, primary, bold, italic) {
  const out = []
  for (const para of String(text).split('\n')) {
    if (para === '') { out.push(''); continue }
    let cur = ''
    let curW = 0
    for (const tok of tokenizeForWrap(para)) {
      const isSpace = tok.trim() === ''
      const tokW = runsWidthPx(tok, fontSizePx, primary, bold, italic)
      if (!isSpace && curW > 0 && curW + tokW > maxWidthPx) { out.push(cur); cur = ''; curW = 0 }
      if (!isSpace && tokW > maxWidthPx) {
        // 单个词超过整行宽:break-word 字符级强断
        for (const ch of tok) {
          const chW = runsWidthPx(ch, fontSizePx, primary, bold, italic)
          if (curW > 0 && curW + chW > maxWidthPx) { out.push(cur); cur = ''; curW = 0 }
          cur += ch; curW += chW
        }
      } else {
        cur += tok; curW += tokW
      }
    }
    out.push(cur)
  }
  return out
}

export { FONT_FAMILY, FONT_PATHS, songOk }
