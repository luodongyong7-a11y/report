// 报表字体策略：单一事实源（SSOT）。
// 设计器画布、浏览器预览、边车 PDF 三条链路共用同一份字体/行高/内边距口径，
// 边车经 report-pdf/engine/font-policy.mjs 以相对路径桥接复用本文件（同 reportExpressions 的零拷贝范式），
// 杜绝两端各自硬编码导致字体回退、行高、分页各走各的。
//
// 约束：本文件必须框架无关、零依赖，可被 Vite（前端）与 Node（边车）同时 import。
// 不得引入 Vue、i18n、@ 别名或任何浏览器/Node 专有 API。

/** CSS / 设计器坐标 dpi；PDF 用户空间为 72pt/inch。 */
export const CSS_DPI = 96
export const PDF_PT_DPI = 72
export const PX_PER_PT = CSS_DPI / PDF_PT_DPI
export const PT_PER_PX = PDF_PT_DPI / CSS_DPI

/** 历史默认 12px ≡ 9pt（96dpi）。新写入一律带单位，底层 canonical 为 px。 */
export const REPORT_DEFAULT_FONT_SIZE_PX = 12
export const REPORT_DEFAULT_FONT_SIZE_PT = 9
export const REPORT_DEFAULT_FONT_SIZE = '12px'

// 文本内边距(px)：设计器 / PDF / HTML 同源。过小贴边难看，过大易与 Excel 错位；当前取 1。
export const REPORT_TEXT_PADDING_PX = 1

export const REPORT_MEDIA_PADDING_PX = 3

/** After padding, keep at least this many px so the glyph/image can still draw. */
const MEDIA_INNER_MIN_PX = 4

export function defaultMediaPaddingPx (type) {
  if (type === 'image') return REPORT_MEDIA_PADDING_PX
  return 0
}

/**
 * Box inset (px) between the element border and the media graphic.
 * Explicit element.padding (>= 0) wins; otherwise type default (barcode/qrcode 0, image 3).
 * Clamped so the inner box stays at least MEDIA_INNER_MIN_PX when width/height are known.
 */
export function resolveMediaPaddingPx (element) {
  const raw = element && element.padding
  const n = Number(raw)
  let pad = (raw != null && raw !== '' && Number.isFinite(n) && n >= 0)
    ? n
    : defaultMediaPaddingPx(element && element.type)
  const w = Number(element && element.width)
  const h = Number(element && element.height)
  const minDim = Math.min(
    Number.isFinite(w) && w > 0 ? w : Infinity,
    Number.isFinite(h) && h > 0 ? h : Infinity
  )
  if (!Number.isFinite(minDim)) return pad
  const maxPad = Math.max(0, (minDim - MEDIA_INNER_MIN_PX) / 2)
  if (pad > maxPad) pad = maxPad
  return pad
}

function pdfFontLookupName (fontName) {
  return String(fontName || '').replace(/^.*\+/, '').toLowerCase()
}

/**
 * Map a PDF BaseFont / PostScript name onto a whitelist CSS family.
 * Specific Windows/CJK faces first; commercial Adobe (Myriad, Minion, …) and
 * leftover generics (sans/gothic/song) fall back to Arial/Times/SimHei/SimSun.
 */
export function mapPdfFontFamily (fontName) {
  const lower = pdfFontLookupName(fontName)
  if (lower.includes('myriad')) return 'Arial'
  if (lower.includes('minion')) return 'Times New Roman'
  if (lower.includes('yahei') || lower.includes('msyh') || lower.includes('微软雅黑')) return 'Microsoft YaHei'
  if (lower.includes('jhenghei') || lower.includes('msjh') || lower.includes('微软正黑体')) return 'Microsoft JhengHei'
  if (lower.includes('dengxian') || lower.includes('等线')) return 'DengXian'
  if (lower.includes('malgun')) return 'Malgun Gothic'
  if (lower.includes('yugothic') || lower.includes('yu gothic')) return 'Yu Gothic'
  if (lower.includes('kaiti') || lower.includes('adobekai') || lower.includes('楷体')) return 'KaiTi'
  if (lower.includes('fangsong') || lower.includes('仿宋')) return 'FangSong'
  if (lower.includes('simhei') || lower.includes('heiti') || lower.includes('黑体')) return 'SimHei'
  if (lower.includes('simsun') || lower.includes('stsong') || lower.includes('adobesong') || lower.includes('宋体')) {
    return 'SimSun'
  }
  if (lower.includes('arialblack') || lower.includes('arial-black') || lower.includes('arial black')) return 'Arial Black'
  if (lower.includes('arialnarrow') || lower.includes('arial-narrow') || lower.includes('arial narrow')) return 'Arial Narrow'
  if (lower.includes('centurygothic') || lower.includes('century gothic')) return 'Century Gothic'
  if (lower.includes('franklin')) return 'Franklin Gothic Medium'
  if (lower.includes('comicsans') || lower.includes('comic sans')) return 'Comic Sans MS'
  if (lower.includes('palatino')) return 'Palatino Linotype'
  if (lower.includes('bookantiqua') || lower.includes('book antiqua') || lower.includes('bookos')) return 'Book Antiqua'
  if (lower.includes('garamond')) return 'Garamond'
  if (lower.includes('calibri')) return 'Calibri'
  if (lower.includes('cambria')) return 'Cambria'
  if (lower.includes('georgia')) return 'Georgia'
  if (lower.includes('verdana')) return 'Verdana'
  if (lower.includes('tahoma')) return 'Tahoma'
  if (lower.includes('trebuchet')) return 'Trebuchet MS'
  if (lower.includes('segoe') && lower.includes('symbol')) return 'Segoe UI Symbol'
  if (lower.includes('segoe')) return 'Segoe UI'
  if (lower.includes('consolas')) return 'Consolas'
  if (lower.includes('lucida') && lower.includes('console')) return 'Lucida Console'
  if (lower.includes('lucida')) return 'Lucida Sans Unicode'
  if (lower.includes('candara')) return 'Candara'
  if (lower.includes('constantia')) return 'Constantia'
  if (lower.includes('corbel')) return 'Corbel'
  if (lower.includes('impact')) return 'Impact'
  if (lower.includes('webding')) return 'Webdings'
  if (lower.includes('wingding') || lower.includes('zapf') || lower.includes('dingbat')) return 'Wingdings'
  if (lower === 'symbol' || /(^|[^a-z])symbol([^a-z]|$)/.test(lower)) return 'Symbol'
  if (lower.includes('courier')) return 'Courier New'
  if (lower.includes('times') || lower.includes('roman')) return 'Times New Roman'
  if (lower.includes('ocr') && (lower.includes('b') || lower.endsWith('ocrb'))) return 'OCR-B'
  if (lower.includes('ocr') && (lower.includes('a') || lower.includes('extended'))) return 'OCR-A'
  if (lower.includes('helvetica') || lower.includes('arial')) return 'Arial'
  if (lower.includes('song')) return 'SimSun'
  if (lower.includes('gothic') || lower.includes('hei')) return 'SimHei'
  if (lower.includes('sans')) return 'Arial'
  return 'Arial'
}

export function mapPdfFontMeta (fontName) {
  const n = String(fontName || '')
  const family = mapPdfFontFamily(n)
  const arialBlack = /arial.?black/i.test(n)
  return {
    family,
    weight: arialBlack
      ? 'normal'
      : (/bold|black|heavy|semibold/i.test(n) ? 'bold' : 'normal'),
    style: /italic|oblique|[-_](?:bold)?it$/i.test(n) ? 'italic' : 'normal'
  }
}

// 中文/符号兜底：只落到边车同源的 SimSun（及 Windows 别名「宋体」）与 Segoe UI Symbol，
// 禁止未打包的漂移 sans（如系统默认 sans-serif）单独作为中文兜底。
export const REPORT_CJK_FALLBACK = 'SimSun, "宋体", "Segoe UI Symbol"'

// 默认字体栈：与边车 PDF/HTML 预览同一口径（Times + SimSun + Segoe UI Symbol），
// 不含未注册同源文件的字体，避免「设计器一套、预览另一套」。
export const REPORT_DEFAULT_FONT_FAMILY =
  '"Times New Roman", SimSun, "宋体", "Segoe UI Symbol"'

// 字体白名单：边车有同源字体文件（或 Adobe Base-14 用等价文件）+ 浏览器本地可得。
// Helvetica → Arial 文件（Windows/Acrobat 常见替代）；Symbol/Wingdings 对应 Adobe Symbol/ZapfDingbats。
// value 为空串表示自动（用默认栈）；labelKey 走前端 i18n，缺省用 value 作显示名。
function fontFaceEntries (family, labelKey, faces = ['', 'Bold', 'Italic', 'Bold Italic']) {
  return faces.map((face, i) => {
    const value = face ? `${family} ${face}` : family
    if (i === 0 && labelKey) return { value, labelKey }
    return { value }
  })
}

export const REPORT_FONT_WHITELIST = [
  { value: '', labelKey: 'designer.toolbar.fontAuto' },
  ...fontFaceEntries('Arial', 'designer.toolbar.fontArial'),
  ...fontFaceEntries('Helvetica'),
  { value: 'OCR-B' },
  { value: 'OCR-A' },
  { value: 'SimSun', labelKey: 'designer.toolbar.fontSimSun' },
  { value: 'SimHei', labelKey: 'designer.toolbar.fontSimHei' },
  { value: 'KaiTi', labelKey: 'designer.toolbar.fontKaiTi' },
  { value: 'FangSong', labelKey: 'designer.toolbar.fontFangSong' },
  { value: 'Microsoft YaHei', labelKey: 'designer.toolbar.fontYaHei' },
  { value: 'Microsoft JhengHei', labelKey: 'designer.toolbar.fontJhengHei' },
  { value: 'DengXian', labelKey: 'designer.toolbar.fontDengXian' },
  { value: 'Malgun Gothic' },
  { value: 'Yu Gothic' },
  ...fontFaceEntries('Times New Roman'),
  ...fontFaceEntries('Courier New'),
  { value: 'Symbol' },
  { value: 'Wingdings' },
  { value: 'Webdings' },
  { value: 'Arial Black' },
  ...fontFaceEntries('Arial Narrow'),
  ...fontFaceEntries('Calibri'),
  ...fontFaceEntries('Cambria'),
  ...fontFaceEntries('Candara'),
  ...fontFaceEntries('Constantia'),
  ...fontFaceEntries('Corbel'),
  ...fontFaceEntries('Georgia'),
  ...fontFaceEntries('Verdana'),
  ...fontFaceEntries('Tahoma'),
  ...fontFaceEntries('Segoe UI'),
  ...fontFaceEntries('Trebuchet MS'),
  ...fontFaceEntries('Palatino Linotype'),
  ...fontFaceEntries('Book Antiqua'),
  ...fontFaceEntries('Garamond'),
  ...fontFaceEntries('Century Gothic'),
  { value: 'Franklin Gothic Medium' },
  { value: 'Franklin Gothic Medium Bold' },
  ...fontFaceEntries('Comic Sans MS'),
  { value: 'Impact' },
  ...fontFaceEntries('Consolas'),
  { value: 'Lucida Console' },
  { value: 'Lucida Sans Unicode' },
  { value: 'Segoe UI Symbol' }
]

/**
 * Split a named face ("Arial Bold") into family + weight + style.
 * Arial Black / Arial Narrow stay whole families.
 */
export function parseFontFaceName (name) {
  const raw = String(name || '').trim()
  if (!raw) return { family: '', weight: 'normal', style: 'normal' }
  if (/^arial black(\s+italic)?$/i.test(raw)) {
    return {
      family: 'Arial Black',
      weight: 'normal',
      style: /italic/i.test(raw) ? 'italic' : 'normal'
    }
  }
  let family = raw
  let weight = 'normal'
  let style = 'normal'
  if (/\s+bold\s+italic$/i.test(raw)) {
    family = raw.replace(/\s+bold\s+italic$/i, '')
    weight = 'bold'
    style = 'italic'
  } else if (/\s+italic$/i.test(raw)) {
    family = raw.replace(/\s+italic$/i, '')
    style = 'italic'
  } else if (/\s+bold$/i.test(raw)) {
    family = raw.replace(/\s+bold$/i, '')
    weight = 'bold'
  }
  return { family, weight, style }
}

/** Compose a named face for the toolbar dropdown. */
export function composeFontFaceName (family, weight, style) {
  const parsed = parseFontFaceName(family)
  const base = parsed.family
  if (!base) return ''
  const bold = weight == null || weight === ''
    ? parsed.weight === 'bold'
    : isBoldWeight(weight)
  const italic = style == null || style === ''
    ? parsed.style === 'italic'
    : (style === 'italic' || style === 'oblique')
  if (bold && italic) return `${base} Bold Italic`
  if (bold) return `${base} Bold`
  if (italic) return `${base} Italic`
  return base
}

/** CJK-capable primary keys used by the PDF sidecar run splitter. */
export const REPORT_CJK_FONT_KEYS = Object.freeze([
  'song', 'hei', 'kai', 'fang', 'yahei', 'jhenghei', 'dengxian', 'malgun', 'yugothic'
])

export function roundFontSize (n, digits = 2) {
  const x = Number(n)
  if (!Number.isFinite(x) || x <= 0) return 0
  const f = 10 ** digits
  return Math.round(x * f) / f
}

/**
 * Parse style.fontSize.
 * - "12pt" / "16px" → explicit unit
 * - bare number / "12" → legacy px（历史模板无单位数字一律按 px）
 */
export function parseFontSize (value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    return { value, unit: 'px' }
  }
  const s = String(value).trim().toLowerCase()
  const m = s.match(/^([0-9]*\.?[0-9]+)\s*(pt|px)?$/)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  return { value: n, unit: m[2] === 'pt' ? 'pt' : 'px' }
}

export function fontSizeToPx (value) {
  const p = parseFontSize(value)
  if (!p) return REPORT_DEFAULT_FONT_SIZE_PX
  return p.unit === 'pt' ? p.value * PX_PER_PT : p.value
}

export function fontSizeToPt (value) {
  const p = parseFontSize(value)
  if (!p) return REPORT_DEFAULT_FONT_SIZE_PT
  return p.unit === 'px' ? p.value * PT_PER_PX : p.value
}

/** Write canonical size with unit（默认 px，与设计器坐标 / 边车度量同源）。 */
export function formatFontSize (value, unit = 'px') {
  const u = unit === 'pt' ? 'pt' : 'px'
  const n = u === 'pt' ? fontSizeToPt(value) : fontSizeToPx(value)
  const rounded = roundFontSize(n)
  return rounded > 0 ? `${rounded}${u}` : REPORT_DEFAULT_FONT_SIZE
}

/**
 * 设计器/工具栏写入用：无单位数字按 assumeUnit（默认 pt，便于 Acrobat 口径录入）理解，
 * 再统一存为 storeUnit（默认 px，底层 canonical）。
 * 与 parseFontSize 的「裸数字 = legacy px」区分。
 */
export function formatFontSizeInput (value, { assumeUnit = 'pt', storeUnit = 'px' } = {}) {
  if (value === undefined || value === null || value === '') return REPORT_DEFAULT_FONT_SIZE
  const raw = String(value).trim()
  if (!raw) return REPORT_DEFAULT_FONT_SIZE
  const outUnit = storeUnit === 'pt' ? 'pt' : 'px'
  if (!/(pt|px)\s*$/i.test(raw) && /^[0-9]*\.?[0-9]+$/.test(raw)) {
    const u = assumeUnit === 'px' ? 'px' : 'pt'
    return formatFontSize(`${raw}${u}`, outUnit)
  }
  return formatFontSize(value, outUnit)
}

/**
 * CSS / 画布用：统一输出 px（与存储 / 边车度量同源）。
 * 显式 pt 按 96dpi 换算；无单位数字按 legacy px。
 */
export function normalizeFontSizeCss (value) {
  const p = parseFontSize(value)
  if (!p) return undefined
  return `${roundFontSize(fontSizeToPx(value))}px`
}

/**
 * 模板 JSON 存储：始终带单位，默认统一为 px。
 * 显式 pt/px 与历史无单位数字均换算到 preferredUnit（默认 px）。
 */
export function normalizeFontSizeStored (value, preferredUnit = 'px') {
  if (value === undefined || value === null || value === '') return REPORT_DEFAULT_FONT_SIZE
  const p = parseFontSize(value)
  if (!p) return REPORT_DEFAULT_FONT_SIZE
  return formatFontSize(`${p.value}${p.unit}`, preferredUnit === 'pt' ? 'pt' : 'px')
}

function quoteFamily (name) {
  const v = String(name).trim()
  if (v.startsWith('"') || v.startsWith("'")) return v
  return /\s/.test(v) ? `"${v}"` : v
}

function isBoldWeight (weight) {
  if (weight == null || weight === '') return false
  if (weight === 'bold' || weight === 'bolder') return true
  const n = Number(weight)
  return Number.isFinite(n) && n >= 600
}

/** Windows/Adobe PostScript names so designer CSS and PDF BaseFont match WPS. */
const LATIN_POSTSCRIPT_FACE = {
  arial: { regular: 'ArialMT', bold: 'Arial-BoldMT', italic: 'Arial-ItalicMT', bi: 'Arial-BoldItalicMT' },
  times: {
    regular: 'TimesNewRomanPSMT',
    bold: 'TimesNewRomanPS-BoldMT',
    italic: 'TimesNewRomanPS-ItalicMT',
    bi: 'TimesNewRomanPS-BoldItalicMT'
  },
  courier: {
    regular: 'CourierNewPSMT',
    bold: 'CourierNewPS-BoldMT',
    italic: 'CourierNewPS-ItalicMT',
    bi: 'CourierNewPS-BoldItalicMT'
  }
}

export function latinPostScriptFace (fontKey, weight, style) {
  const table = LATIN_POSTSCRIPT_FACE[fontKey]
  if (!table) return ''
  const bold = isBoldWeight(weight)
  const italic = style === 'italic' || style === 'oblique'
  if (bold && italic) return table.bi
  if (bold) return table.bold
  if (italic) return table.italic
  return table.regular
}

// 把元素的 fontFamily 解析成「带中文兜底」的完整字体栈（设计器画布、内联编辑、浏览器预览共用）。
// 空 → 默认栈；已是字体栈（含逗号）→ 原样尊重；单值 → 追加中文兜底链。
// Arial/Times/Courier 加粗走 PostScript 面名（Arial-BoldMT），与 WPS/Acrobat 一致。
export function resolveReportFontFamily (fontFamily, weight, style) {
  const v = (fontFamily == null ? '' : String(fontFamily)).trim()
  if (v === '') return REPORT_DEFAULT_FONT_FAMILY
  if (v.includes(',')) return v
  let w = weight
  let s = style
  if (w == null && /bold/i.test(v)) w = 'bold'
  if (s == null && /italic|oblique/i.test(v)) s = 'italic'
  const key = fontKeyForFamily(v)
  const ps = latinPostScriptFace(key, w, s)
  if (ps) return `"${ps}", ${quoteFamily(v)}, ${REPORT_CJK_FALLBACK}`
  if (/^helvetica$/i.test(v)) return `"Helvetica", Arial, ${REPORT_CJK_FALLBACK}`
  if (/^ocr-?b$/i.test(v)) return `"OCR-B", OCRB, Arial, ${REPORT_CJK_FALLBACK}`
  if (/^ocr-?a$/i.test(v)) return `"OCR-A", OCRA, "OCR A Extended", Arial, ${REPORT_CJK_FALLBACK}`
  return `${quoteFamily(v)}, ${REPORT_CJK_FALLBACK}`
}

/**
 * Map element fontFamily onto a sidecar primary key:
 *  - latin keys：西文主字体；中文仍按字形回退到 song 等
 *  - song / hei / kai / fang / yahei：中西文都优先走对应内置字体
 *  - pdfsymbol / dingbats / symbol：Adobe Symbol、ZapfDingbats、Unicode 符号
 * 未识别（含空）→ times（与历史默认一致）
 */
export function fontKeyForFamily (fontFamily) {
  const v = (fontFamily == null ? '' : String(fontFamily)).trim().toLowerCase()
  if (v === '') return 'times'
  if (v.includes('yahei') || v.includes('微软雅黑') || v.includes('microsoft yahei')) return 'yahei'
  if (v.includes('jhenghei') || v.includes('微软正黑体')) return 'jhenghei'
  if (v.includes('dengxian') || v.includes('等线')) return 'dengxian'
  if (v.includes('malgun')) return 'malgun'
  if (v.includes('yu gothic') || v.includes('yugothic')) return 'yugothic'
  if (v.includes('simhei') || v.includes('黑体') || v.includes('heiti')) return 'hei'
  if (v.includes('kaiti') || v.includes('楷')) return 'kai'
  if (v.includes('fangsong') || v.includes('仿宋') || v.includes('fang song')) return 'fang'
  if (v.includes('simsun') || v.includes('宋体') || v.includes('songti') || (v.includes('宋') && !v.includes('仿宋'))) {
    return 'song'
  }
  if (v.includes('webding')) return 'webdings'
  if (v.includes('wingding') || v.includes('zapf') || v.includes('dingbat')) return 'dingbats'
  if (v.includes('segoe') && v.includes('symbol')) return 'symbol'
  if (v === 'symbol' || /(^|[^a-z])symbol([^a-z]|$)/.test(v)) return 'pdfsymbol'
  if (v.includes('arial') && v.includes('black')) return 'arialblack'
  if (v.includes('arial') && v.includes('narrow')) return 'arialnarrow'
  if (v.includes('century') && v.includes('gothic')) return 'gothic'
  if (v.includes('franklin')) return 'franklin'
  if (v.includes('comic')) return 'comic'
  if (v.includes('palatino')) return 'palatino'
  if (v.includes('book antiqua') || v.includes('bookantiqua')) return 'bookantiqua'
  if (v.includes('garamond')) return 'garamond'
  if (v.includes('calibri')) return 'calibri'
  if (v.includes('cambria')) return 'cambria'
  if (v.includes('candara')) return 'candara'
  if (v.includes('constantia')) return 'constantia'
  if (v.includes('corbel')) return 'corbel'
  if (v.includes('georgia')) return 'georgia'
  if (v.includes('verdana')) return 'verdana'
  if (v.includes('tahoma')) return 'tahoma'
  if (v.includes('trebuchet')) return 'trebuchet'
  if (v.includes('segoe')) return 'segoeui'
  if (v.includes('consolas')) return 'consolas'
  if (v.includes('lucida') && v.includes('console')) return 'lucida'
  if (v.includes('lucida')) return 'lucidasans'
  if (v.includes('impact')) return 'impact'
  if (v.includes('courier') || v.includes('mono')) return 'courier'
  if (v.includes('ocr') && (v.includes('b') || v.endsWith('ocrb'))) return 'ocrb'
  if (v.includes('ocr') && (v.includes('a') || v.includes('extended'))) return 'ocra'
  if (v.includes('arial') || v.includes('helvetica')) return 'arial'
  if (v.includes('times')) return 'times'
  return 'times'
}
