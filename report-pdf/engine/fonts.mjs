// 字体基座:同时服务「napi 度量」与「pdfkit 绘制」,二者必须用同一批字体文件。
//
// 关键约束(与前端 reportElementStyle 注释一致):度量字体必须等于绘制字体,
// 否则换行/行高漂移。生产环境(Alpine/Linux)需把 FONT_PATHS 覆盖为同源字体,
// 字形度量才与设计预览一致。
//
// 必须在 import 任何会触发 Pretext 度量的代码之前先执行本模块(import 顺序放最前),
// 因为本模块负责装好 OffscreenCanvas 垫片与 navigator 伪装。
import { GlobalFonts, createCanvas } from '@napi-rs/canvas'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'

// fontkit 与 pdfkit 同源(pdfkit 依赖),用于按字形覆盖判定字符回退到哪款字体。
const require = createRequire(import.meta.url)
let fontkit = null
try { fontkit = require('fontkit') } catch (e) { console.warn('fontkit 不可用,字体回退降级为按脚本判定:', e.message) }

// 字体家族 canonical 别名(napi 注册别名 + pdfkit 取面名)。
// times: 拉丁/越南文主力;song: 中日韩主力;hei: 黑体(标题等可选);
// symbol: 几何/勾选符号(▢ ☑ 等),与 Windows 浏览器对这些字符的 fallback(Segoe UI Symbol)对齐。
export const FONT_FAMILY = {
  times: 'Times New Roman',
  song: 'SimSun',
  hei: 'SimHei',
  symbol: 'Segoe UI Symbol'
}

// 默认字体文件路径(Windows 开发机)。生产环境用 REPORT_FONT_* 环境变量覆盖。
// times 的 bold/italic/bolditalic 用 Windows 自带的同族真实字面(timesbd/timesi/timesbi);
// 中文 SimSun/SimHei 无独立加粗/斜体文件,加粗斜体在绘制端合成(见 resolveFace)。
const DEFAULT_FONT_PATHS = {
  times: process.env.REPORT_FONT_TIMES || path.join('C:\\Windows\\Fonts', 'times.ttf'),
  timesBd: process.env.REPORT_FONT_TIMES_BOLD || path.join('C:\\Windows\\Fonts', 'timesbd.ttf'),
  timesIt: process.env.REPORT_FONT_TIMES_ITALIC || path.join('C:\\Windows\\Fonts', 'timesi.ttf'),
  timesBi: process.env.REPORT_FONT_TIMES_BOLDITALIC || path.join('C:\\Windows\\Fonts', 'timesbi.ttf'),
  simsun: process.env.REPORT_FONT_SIMSUN || path.join('C:\\Windows\\Fonts', 'simsun.ttc'),
  simhei: process.env.REPORT_FONT_SIMHEI || path.join('C:\\Windows\\Fonts', 'simhei.ttf'),
  segoesym: process.env.REPORT_FONT_SYMBOL || path.join('C:\\Windows\\Fonts', 'seguisym.ttf')
}

// 合成加粗/斜体可调参数(中文及缺真实字面的字体用):
//  - boldOffsetRatio: 合成粗体的双描偏移 = fontSizePt * 比率(越大越粗),环境变量 REPORT_SYNTH_BOLD_RATIO 覆盖
//  - italicSkew: 合成斜体的切变量(tan 倾角,0.213 约 12 度),环境变量 REPORT_SYNTH_ITALIC_SKEW 覆盖
export const SYNTH = {
  boldOffsetRatio: Number(process.env.REPORT_SYNTH_BOLD_RATIO || 0.025),
  italicSkew: Number(process.env.REPORT_SYNTH_ITALIC_SKEW || 0.213)
}

export const FONT_PATHS = { ...DEFAULT_FONT_PATHS }

// pdfkit 注册 .ttc 需要面名;simsun.ttc 取 SimSun 面;NotoSansCJK 取 Noto Sans CJK SC。
// times 的真实加粗/斜体字面均为单 face ttf,面名留 null。
const PDF_FACE = {
  times: null,
  timesBd: null,
  timesIt: null,
  timesBi: null,
  simsun: process.env.REPORT_FONT_SIMSUN_FACE || 'SimSun',
  simhei: process.env.REPORT_FONT_SIMHEI_FACE || null,
  segoesym: null
}

export const fontRegistration = {}

// napi 注册别名(文件 key -> 别名)。times 的加粗/斜体用独立别名,度量端按别名精确选面,
// 不依赖 skia 的 weight/style 自动匹配(确定性更强)。
const NAPI_ALIAS = {
  times: FONT_FAMILY.times,
  timesBd: 'TkTimesBd',
  timesIt: 'TkTimesIt',
  timesBi: 'TkTimesBi',
  simsun: FONT_FAMILY.song,
  simhei: FONT_FAMILY.hei,
  segoesym: FONT_FAMILY.symbol
}

// 同一批字体的 fontkit 句柄(key 同 FONT_PATHS:times/simsun/simhei/segoesym),用于 hasGlyphForCodePoint。
const fontkitFonts = { times: null, simsun: null, simhei: null, segoesym: null }
const FONTKIT_FACE = { times: null, simsun: PDF_FACE.simsun, simhei: PDF_FACE.simhei, segoesym: null }

function openFontkit (p, face) {
  if (!fontkit) return null
  try {
    const f = fontkit.openSync(p)
    if (f && Array.isArray(f.fonts)) return (face && f.getFont(face)) || f.fonts[0]
    return f
  } catch (e) { return null }
}

function registerNapiFont (key, p) {
  const exists = fs.existsSync(p)
  let ok = false
  if (exists) {
    const alias = NAPI_ALIAS[key] || FONT_FAMILY.times
    try {
      ok = Boolean(GlobalFonts.registerFromPath(p, alias))
    } catch (e) {
      ok = false
      console.warn(`registerFromPath 失败 ${key} (${p}): ${e.message}`)
    }
  }
  fontkitFonts[key] = exists ? openFontkit(p, FONTKIT_FACE[key]) : null
  fontRegistration[key] = { path: p, exists, registered: ok, pdfFace: PDF_FACE[key], glyphSource: Boolean(fontkitFonts[key]) }
}

// 该字体是否含某码点字形。fontKey 用绘制端口径:times/song/hei/symbol。fontkit 不可用时返回 false(退回按脚本判定)。
const GLYPH_FONT_KEY = { times: 'times', song: 'simsun', hei: 'simhei', symbol: 'segoesym' }
// 码点字形覆盖缓存:hasGlyphForCodePoint 对同一 (fontKey, 码点) 反复调用结果恒定,
// 码点集合有限,永久缓存命中率极高(大报表可省数十万次 fontkit 调用)。字体重注册时清空。
const glyphCache = { times: new Map(), song: new Map(), hei: new Map(), symbol: new Map() }
export function glyphHas (fontKey, codePoint) {
  const cache = glyphCache[fontKey]
  if (cache) { const hit = cache.get(codePoint); if (hit !== undefined) return hit }
  const f = fontkitFonts[GLYPH_FONT_KEY[fontKey]]
  let res = false
  if (f) { try { res = f.hasGlyphForCodePoint(codePoint) } catch (e) { res = false } }
  if (cache) cache.set(codePoint, res)
  return res
}

// 浏览器(Windows Chrome)的 normal 行高口径,用同一批字体文件直接读 OS/2 度量算出,
// 让边车测高与浏览器预览零漂移(取代 pdfkit currentLineHeight 那套偏大的 hhea 口径)。
// 规则:fsSelection 的 USE_TYPO_METRICS 位为 1 时用 typo(asc - desc + gap),
// 否则用 OS/2 win(winAscent + winDescent);无 OS/2 退回 hhea。返回比率(除以 unitsPerEm);读取失败返回 null。
// fontKey 用绘制端口径:times / song / hei / symbol。
export function browserNormalLineHeightRatio (fontKey) {
  const f = fontkitFonts[GLYPH_FONT_KEY[fontKey]]
  if (!f) return null
  try {
    const em = f.unitsPerEm || 1000
    const os2 = f['OS/2']
    if (os2 && os2.winAscent != null) {
      const fsSel = os2.fsSelection
      const useTypo = (fsSel && typeof fsSel === 'object')
        ? Boolean(fsSel.useTypoMetrics)
        : ((Number(fsSel) & 0x80) !== 0)
      if (useTypo && os2.typoAscender != null) {
        return (os2.typoAscender - os2.typoDescender + (os2.typoLineGap || 0)) / em
      }
      return (os2.winAscent + os2.winDescent) / em
    }
    const hhea = f.hhea
    if (hhea && hhea.ascent != null) return (hhea.ascent - hhea.descent + (hhea.lineGap || 0)) / em
  } catch (e) { /* 读取失败:调用方回退 pdfkit currentLineHeight 口径 */ }
  return null
}

// 字体子系统健康度 + 度量自检:供 /health 与启动自检使用。
// degraded 判定(任一成立即降级):
//   1) fontkit 不可用 → 行高回退 pdfkit hhea 口径,可能与浏览器预览漂移;
//   2) 有字体未注册(MISS) → 该字面无法度量/绘制;
//   3) 主字体用 OS/2 算不出浏览器口径行高 → "度量源=绘制字体"链路未打通。
export function fontHealth () {
  const faces = Object.entries(fontRegistration)
  const missing = faces.filter(([, v]) => !v.registered).map(([k]) => k)
  const reasons = []
  if (!fontkit) reasons.push('fontkit 不可用:行高回退 pdfkit hhea 口径,可能与浏览器预览漂移')
  if (missing.length) reasons.push(`字体未注册(MISS): ${missing.join(', ')}`)
  // 度量自检:主字体(拉丁 times / 中日韩 song)能否用 OS/2 算出行高,验证度量链路真的通。
  const lineHeightProbe = {}
  const metricFail = []
  for (const k of ['times', 'song']) {
    const r = browserNormalLineHeightRatio(k)
    lineHeightProbe[k] = r
    if (r == null) metricFail.push(k)
  }
  if (fontkit && metricFail.length) reasons.push(`OS/2 行高度量失败: ${metricFail.join(', ')}(回退 hhea)`)
  return {
    fontkit: Boolean(fontkit),
    lineHeightSource: (fontkit && metricFail.length === 0) ? 'os2' : 'hhea-fallback',
    lineHeightProbe,
    degraded: reasons.length > 0,
    reasons,
    fonts: fontRegistration
  }
}

// 某 face 是否注册成功(文件存在且 napi 注册 OK)。
function faceRegistered (key) {
  const r = fontRegistration[key]
  return Boolean(r && r.registered)
}

// 把(主字体 key + 是否加粗 + 是否斜体)解析成绘制/度量所需的字面描述:
//   { pdfName, napiAlias, synthBold, synthItalic }
// - pdfName  : draw 端 pdfkit 注册名(times/timesBd/timesIt/timesBi/song/hei/symbol)
// - napiAlias: 度量端 napi 别名(同一字面,保证测画一致)
// - synthBold/synthItalic: 该字面无真实加粗/斜体文件时为 true,由绘制端合成(双描/切变)
// 规则:仅 Times 系有真实 bd/it/bi 文件;中文 song/hei 与符号 symbol 一律合成。
// 真实文件缺失(未部署 timesbd 等)时自动降级为合成,保证健壮。
export function resolveFace (fontKey, bold, italic) {
  if (fontKey === 'times') {
    if (bold && italic && faceRegistered('timesBi')) return { pdfName: 'timesBi', napiAlias: NAPI_ALIAS.timesBi, synthBold: false, synthItalic: false }
    if (bold && faceRegistered('timesBd')) return { pdfName: 'timesBd', napiAlias: NAPI_ALIAS.timesBd, synthBold: false, synthItalic: false }
    if (italic && faceRegistered('timesIt')) return { pdfName: 'timesIt', napiAlias: NAPI_ALIAS.timesIt, synthBold: false, synthItalic: false }
    return { pdfName: 'times', napiAlias: FONT_FAMILY.times, synthBold: Boolean(bold), synthItalic: Boolean(italic) }
  }
  const napiAlias = FONT_FAMILY[fontKey] || FONT_FAMILY.times
  return { pdfName: fontKey, napiAlias, synthBold: Boolean(bold), synthItalic: Boolean(italic) }
}

// 字体文件预读缓存(key 同 FONT_PATHS)。pdfkit registerFont 可直接吃 Buffer,
// 避免每次 createDoc 都从磁盘重读(simsun.ttc 达 18MB),显著省 IO。字体重注册时刷新。
export const FONT_BUFFERS = {}
function loadFontBuffers () {
  for (const [key, p] of Object.entries(FONT_PATHS)) {
    try { FONT_BUFFERS[key] = fs.existsSync(p) ? fs.readFileSync(p) : null } catch (e) { FONT_BUFFERS[key] = null }
  }
}

// 注册全部字体到 napi GlobalFonts(measureText 用)。pdfkit 在 draw 模块自行 registerFont。
export function registerAllFonts () {
  for (const [key, p] of Object.entries(FONT_PATHS)) registerNapiFont(key, p)
  // 字体切换后:预读 Buffer 与字形缓存都要刷新,避免用旧字体的度量/字形结果。
  loadFontBuffers()
  for (const k in glyphCache) glyphCache[k].clear()
  return fontRegistration
}

// 覆盖字体路径(生产环境用同源字体);需在首次度量前调用,并重新注册。
export function setFontPaths (overrides) {
  Object.assign(FONT_PATHS, overrides)
  return registerAllFonts()
}

// OffscreenCanvas 垫片(Pretext getMeasureContext 首选用它)。1x1 足够,measureText 不依赖画布尺寸。
function installOffscreenCanvasShim () {
  if (typeof globalThis.OffscreenCanvas === 'undefined') {
    globalThis.OffscreenCanvas = class OffscreenCanvasShim {
      constructor (w, h) { this._c = createCanvas(w || 1, h || 1) }
      getContext (type) { return this._c.getContext(type) }
    }
  }
}

// 把 navigator 伪装成 Chromium,让 Pretext getEngineProfile 选 Chromium 档位
// (carryCJKAfterClosingQuote=true 等),与用户实际用的 Chrome/Edge 渲染口径对齐。
function installChromiumNavigator () {
  if (typeof globalThis.navigator !== 'undefined' && globalThis.navigator.userAgent) return
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        vendor: 'Google Inc.'
      },
      configurable: true
    })
  } catch (e) {
    console.warn('navigator 伪装失败(引擎档位可能非 Chromium):', e.message)
  }
}

installOffscreenCanvasShim()
installChromiumNavigator()
registerAllFonts()

export { createCanvas, GlobalFonts, PDF_FACE }
