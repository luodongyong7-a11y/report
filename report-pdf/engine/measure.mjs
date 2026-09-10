// 确定性测高:复刻前端内容盒模型,脱离浏览器。
//
// 前端模型(reportElementStyle):
//  - box-sizing: border-box;padding=REPORT_TEXT_PADDING_PX;border=element.border?(width||1):0
//  - 数据区 / 汇总B→页脚文本(autoGrow): offsetHeight = max(element.height, 内容高 + 2pad + 2border)
//  - 页眉 / 汇总A-B / 页脚文本(固定高): offsetHeight = element.height(内容溢出不改变盒高)
//  - 内容宽 = width - 2pad - 2border;normal 行高按行内是否含 CJK 取 Times 或 max(Times,SimSun)
import './fonts.mjs'
import { lineHeightPx, runsWidthPx, normalizeGlyphs, wrapTextByRuns } from './metrics.mjs'
import { REPORT_DEFAULT_FONT_SIZE_PX, REPORT_TEXT_PADDING_PX, fontKeyForFamily } from './font-policy.mjs'

// 字号/内边距 canonical 常量来自前端 SSOT(reportFontPolicy),与设计/预览同源;此处再导出供 draw 与调试脚本复用。
export { REPORT_DEFAULT_FONT_SIZE_PX, REPORT_TEXT_PADDING_PX }

function normalizeFontSizePx (value) {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isNaN(n) ? undefined : n
}

export function resolveFontSizePx (element) {
  const es = element && element.style ? element.style : {}
  return normalizeFontSizePx(es.fontSize) ?? REPORT_DEFAULT_FONT_SIZE_PX
}

export function resolveBorderWidth (element) {
  if (!element || !element.border) return 0
  return element.border.width || 1
}

// 元素是否加粗:style.fontWeight 为 'bold' 或数值字重不小于 600。与设计器 useStyleManager 同口径。
export function resolveFontWeight (element) {
  const w = element && element.style ? element.style.fontWeight : undefined
  if (w == null) return false
  if (w === 'bold' || w === 'bolder') return true
  const n = Number(w)
  return !Number.isNaN(n) && n >= 600
}

// 元素是否斜体:style.fontStyle 为 'italic' 或 'oblique'。
export function resolveFontStyle (element) {
  const s = element && element.style ? element.style : undefined
  const v = s ? s.fontStyle : undefined
  return v === 'italic' || v === 'oblique'
}

// 固定格是否「装不下时缩字」。默认 false=截断(PDF/HTML clip);仅元素显式 shrinkToFit 时缩字重排。
// placed 可能只挂在 original 上,两处都认。
export function resolveShrinkToFit (element) {
  if (!element) return false
  if (element.shrinkToFit === true) return true
  if (element.original && element.original.shrinkToFit === true) return true
  return false
}

// 逐行布局:返回每行 { text, width(px), height(px), top(px,相对内容盒顶) } 与内容总高。
// 换行/行宽/行高全部按 run(逐字符正确字体)计算,与绘制端、浏览器逐字符字体回退同源,测画零漂移。
// 第四参 primaryFontKey 为元素选定的主字体 key(times/song/hei),决定西文/中文各落哪款字体及行高口径。
export function layoutCellLines (text, contentWidthPx, fontSizePx, primaryFontKey, bold, italic) {
  // 缺字规范化放在入口:换行、行宽、以及绘制端用的 line.text 全部一致。
  const str = normalizeGlyphs(text == null ? '' : String(text))
  if (str === '' || contentWidthPx <= 0) {
    return { lines: [], contentHeight: 0 }
  }
  const wrapped = wrapTextByRuns(str, contentWidthPx, fontSizePx, primaryFontKey, bold, italic)

  const lines = []
  let top = 0
  for (const lineText of wrapped) {
    const h = lineHeightPx(lineText, fontSizePx, primaryFontKey)
    lines.push({ text: lineText, width: runsWidthPx(lineText, fontSizePx, primaryFontKey, bold, italic), height: h, top })
    top += h
  }
  return { lines, contentHeight: top }
}

/**
 * 测一个文本/数据单元格,返回盒高与逐行布局(供绘制)。
 * @param {object} element 模板元素(含 width/height/style/border/textAlign 等)
 * @param {{ autoGrow: boolean }} opts 数据区与汇总B→页脚为 true(自增高),否则固定高
 */
export function measureCell (element, { autoGrow } = { autoGrow: false }) {
  let fontSizePx = resolveFontSizePx(element)
  const pad = REPORT_TEXT_PADDING_PX
  const border = resolveBorderWidth(element)
  const contentWidthPx = element.width - 2 * pad - 2 * border
  const availHeightPx = element.height - 2 * pad - 2 * border

  // 边车认元素选定字体:映射成主字体 key,西文/中文据此各落 Times/SimSun/SimHei,与预览一致。
  const primaryFontKey = fontKeyForFamily(element.style && element.style.fontFamily)
  const bold = resolveFontWeight(element)
  const italic = resolveFontStyle(element)
  let { lines, contentHeight } = layoutCellLines(element.parsedContent, contentWidthPx, fontSizePx, primaryFontKey, bold, italic)

  // 固定高默认截断(绘制端 clip);仅 shrinkToFit 时按比例缩字重排装进 availHeight。
  // autoGrow(数据区 / 汇总B→页脚)不缩字,改抬高行盒。
  if (!autoGrow && resolveShrinkToFit(element) && availHeightPx > 0 && contentHeight > availHeightPx) {
    let fs = fontSizePx * (availHeightPx / contentHeight)
    for (let i = 0; i < 4; i++) {
      fs = Math.max(1, fs)
      const next = layoutCellLines(element.parsedContent, contentWidthPx, fs, primaryFontKey, bold, italic)
      fontSizePx = fs
      lines = next.lines
      contentHeight = next.contentHeight
      if (contentHeight <= availHeightPx || contentHeight <= 0) break
      fs = fs * (availHeightPx / contentHeight)
    }
  }

  const grownHeight = contentHeight + 2 * pad + 2 * border
  const boxHeight = autoGrow ? Math.max(element.height, grownHeight) : element.height

  return { fontSizePx, pad, border, contentWidthPx, lines, contentHeight, boxHeight }
}

// 仅要高度(分页用)。媒体类(image/qrcode/barcode)固定高,直接返回 element.height。
export function measureCellHeight (element, { autoGrow } = { autoGrow: false }) {
  if (element.type === 'image' || element.type === 'qrcode' || element.type === 'barcode') {
    return element.height
  }
  return measureCell(element, { autoGrow }).boxHeight
}
