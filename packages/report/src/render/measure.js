import {
  REPORT_DEFAULT_FONT_SIZE_PX,
  REPORT_TEXT_PADDING_PX,
  fontSizeToPx,
  resolveReportFontFamily
} from '../fontPolicy.js'

function isFixedBox (t) {
  return t === 'image' || t === 'qrcode' || t === 'barcode' || t === 'rect'
}

function isCjk (ch) {
  const c = ch.codePointAt(0)
  return c >= 0x2e80 && c <= 0x9fff || c >= 0xf900 && c <= 0xfaff || c >= 0xff00 && c <= 0xffef
}

function charWidthPx (ch, fontSize) {
  if (ch === ' ' || ch === '\t') return fontSize * 0.33
  if (isCjk(ch)) return fontSize
  return fontSize * 0.5
}

function lineHeightPx (text, fontSize) {
  for (const ch of text) {
    if (isCjk(ch)) return fontSize * 1.3
  }
  return fontSize * 1.15
}

export function wrapTextLines (text, contentWidthPx, fontSizePx) {
  const src = text == null ? '' : String(text)
  const width = Number(contentWidthPx)
  const fs = fontSizePx > 0 ? fontSizePx : REPORT_DEFAULT_FONT_SIZE_PX
  if (!src) return [{ text: '', width: 0, height: lineHeightPx('', fs), top: 0 }]
  if (!(width > 0)) {
    return [{ text: src, width: 0, height: lineHeightPx(src, fs), top: 0 }]
  }
  const out = []
  let top = 0
  const paras = src.split('\n')
  for (let p = 0; p < paras.length; p++) {
    const para = paras[p]
    let line = ''
    let w = 0
    const flush = () => {
      const h = lineHeightPx(line, fs)
      out.push({ text: line, width: w, height: h, top })
      top += h
      line = ''
      w = 0
    }
    if (para === '') {
      flush()
      continue
    }
    for (const ch of para) {
      const cw = charWidthPx(ch, fs)
      if (line && w + cw > width) flush()
      line += ch
      w += cw
    }
    flush()
  }
  return out
}

export function resolveBorderWidth (element) {
  if (!element || !element.border) return 0
  const n = Number(element.border.width)
  return Number.isFinite(n) && n > 0 ? n : 1
}

export function resolveFontSizePx (element) {
  const es = element && element.style ? element.style : {}
  return fontSizeToPx(es.fontSize)
}

export function resolveFontWeightBold (element) {
  const w = element && element.style ? element.style.fontWeight : undefined
  if (w == null) return false
  if (w === 'bold' || w === 'bolder') return true
  const n = Number(w)
  return Number.isFinite(n) && n >= 600
}

export function resolveFontItalic (element) {
  const v = element && element.style ? element.style.fontStyle : undefined
  return v === 'italic' || v === 'oblique'
}

function contentBox (element) {
  const pad = REPORT_TEXT_PADDING_PX
  const border = resolveBorderWidth(element)
  const width = Number(element && element.width) || 0
  const height = Number(element && element.height) || 0
  return {
    pad,
    border,
    contentW: Math.max(0, width - 2 * pad - 2 * border),
    designH: height
  }
}

/** 无 DOM 时的测高：按字符宽折行，口径固定，Node / 浏览器都能用。 */
export function heuristicMeasureCell (element, opts = {}) {
  if (!element || isFixedBox(element.type)) {
    return { boxHeight: Number(element && element.height) || 0, lines: [], contentHeight: 0 }
  }
  const autoGrow = !!(opts && opts.autoGrow)
  const box = contentBox(element)
  const fs = resolveFontSizePx(element)
  const text = element.parsedContent != null ? element.parsedContent : (element.content || '')
  const lines = wrapTextLines(text, box.contentW, fs)
  let contentHeight = 0
  for (const ln of lines) contentHeight += ln.height
  const needed = contentHeight + 2 * box.pad + 2 * box.border
  const boxHeight = autoGrow ? Math.max(box.designH, needed) : box.designH
  return { boxHeight, lines, contentHeight }
}

function applyTextBoxStyle (el, node) {
  const es = el.style || {}
  const box = contentBox(el)
  node.style.boxSizing = 'border-box'
  node.style.width = (Number(el.width) || 0) + 'px'
  node.style.padding = box.pad + 'px'
  if (box.border) node.style.border = box.border + 'px solid transparent'
  node.style.whiteSpace = 'pre-wrap'
  node.style.wordWrap = 'break-word'
  node.style.overflowWrap = 'break-word'
  node.style.wordBreak = 'break-word'
  node.style.fontSize = resolveFontSizePx(el) + 'px'
  node.style.fontFamily = resolveReportFontFamily(es.fontFamily, es.fontWeight, es.fontStyle)
  node.style.fontWeight = resolveFontWeightBold(el) ? '700' : '400'
  node.style.fontStyle = resolveFontItalic(el) ? 'italic' : 'normal'
  node.style.lineHeight = 'normal'
  node.style.fontKerning = 'none'
  node.textContent = el.parsedContent != null ? String(el.parsedContent) : String(el.content || '')
}

/** 浏览器实测：与设计器同一套盒模型（offsetHeight）。 */
export function createDomMeasure (doc) {
  const host = doc.createElement('div')
  host.setAttribute('data-niqer-measure', '')
  host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none'
  const root = doc.body || doc.documentElement
  root.appendChild(host)
  return {
    measureCell (element, opts = {}) {
      if (!element || isFixedBox(element.type)) {
        return { boxHeight: Number(element && element.height) || 0, lines: [], contentHeight: 0 }
      }
      const autoGrow = !!(opts && opts.autoGrow)
      const node = doc.createElement('div')
      applyTextBoxStyle(element, node)
      if (autoGrow) {
        node.style.height = 'auto'
        node.style.minHeight = (Number(element.height) || 0) + 'px'
      } else {
        node.style.height = (Number(element.height) || 0) + 'px'
        node.style.overflow = 'hidden'
      }
      host.appendChild(node)
      const boxHeight = node.offsetHeight
      host.removeChild(node)
      return { boxHeight, lines: [], contentHeight: 0 }
    },
    dispose () {
      if (host.parentNode) host.parentNode.removeChild(host)
    }
  }
}

export function createMeasure (opts = {}) {
  const doc = opts.document || (typeof document !== 'undefined' ? document : null)
  if (doc && (doc.body || doc.documentElement)) return createDomMeasure(doc)
  return {
    measureCell: heuristicMeasureCell,
    dispose () {}
  }
}
