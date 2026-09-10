import { encode, toRects } from '@niqer/barcode'
import { adobeUpcSvg, layoutAdobeUpc, wantsAdobeUpc } from '../upcAdobe.js'
import {
  REPORT_TEXT_PADDING_PX,
  resolveMediaPaddingPx,
  resolveReportFontFamily
} from '../fontPolicy.js'
import { layoutReport } from './placed.js'
import {
  resolveBorderWidth,
  resolveFontItalic,
  resolveFontSizePx,
  resolveFontWeightBold,
  wrapTextLines
} from './measure.js'

function esc (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function px (n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return String(Math.round(v * 1000) / 1000)
}

function colorOf (placed) {
  return (placed.style && placed.style.color) || '#000'
}

function bgOf (placed, fallback) {
  if (placed.fill) return placed.fill
  const s = placed.style || {}
  return s.backgroundColor || s.fill || fallback || ''
}

function borderCss (placed) {
  const w = resolveBorderWidth(placed)
  if (!w) return ''
  const c = (placed.border && placed.border.color) || '#000'
  const b = placed.border || {}
  const side = (on) => on === false ? '0' : (w + 'px solid ' + c)
  if (b.top != null || b.right != null || b.bottom != null || b.left != null) {
    return [
      'border-top:' + side(b.top),
      'border-right:' + side(b.right),
      'border-bottom:' + side(b.bottom),
      'border-left:' + side(b.left)
    ].join(';') + ';'
  }
  return 'border:' + w + 'px solid ' + c + ';'
}

function boxCss (placed, extra) {
  const parts = [
    'position:absolute',
    'left:' + px(placed.x) + 'px',
    'top:' + px(placed.y) + 'px',
    'width:' + px(placed.width) + 'px',
    'height:' + px(placed.height) + 'px',
    'box-sizing:border-box',
    'overflow:hidden',
    borderCss(placed)
  ]
  const bg = bgOf(placed, extra && extra.fallbackBg)
  if (bg) parts.push('background:' + bg)
  if (extra && extra.pad != null) parts.push('padding:' + extra.pad + 'px')
  return parts.filter(Boolean).join(';')
}

function paintText (doc, placed) {
  const pad = REPORT_TEXT_PADDING_PX
  const border = resolveBorderWidth(placed)
  const fs = resolveFontSizePx(placed)
  const es = placed.style || {}
  const family = resolveReportFontFamily(es.fontFamily, es.fontWeight, es.fontStyle)
  const align = placed.textAlign || 'center'
  const va = placed.verticalAlign || 'top'
  const contentW = Math.max(0, placed.width - 2 * pad - 2 * border)
  const availH = Math.max(0, placed.height - 2 * pad - 2 * border)
  const text = placed.parsedContent != null ? placed.parsedContent : (placed.content || '')
  const lines = wrapTextLines(text, contentW, fs)
  let contentH = 0
  for (const ln of lines) contentH += ln.height
  let vOffset = 0
  if (va === 'center' || va === 'middle') vOffset = Math.max(0, (availH - contentH) / 2)
  else if (va === 'bottom') vOffset = Math.max(0, availH - contentH)
  const cell = doc.createElement('div')
  cell.className = 'niqer-report-cell niqer-report-cell--text'
  cell.style.cssText = boxCss(placed, { pad })
  const inner = doc.createElement('div')
  inner.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden'
  for (const ln of lines) {
    let left = 0
    if (align === 'right') left = Math.max(0, contentW - ln.width)
    else if (align === 'center') left = Math.max(0, (contentW - ln.width) / 2)
    const span = doc.createElement('div')
    span.style.cssText = [
      'position:absolute',
      'left:' + px(left) + 'px',
      'top:' + px(vOffset + ln.top) + 'px',
      'width:' + px(Math.max(1, ln.width)) + 'px',
      'height:' + px(ln.height) + 'px',
      'line-height:' + px(ln.height) + 'px',
      'white-space:pre',
      'font-size:' + px(fs) + 'px',
      'font-family:' + family,
      'font-weight:' + (resolveFontWeightBold(placed) ? '700' : '400'),
      'font-style:' + (resolveFontItalic(placed) ? 'italic' : 'normal'),
      'color:' + colorOf(placed),
      'text-decoration:' + ((es.textDecoration === 'underline' || es.textDecoration === 'line-through') ? es.textDecoration : 'none')
    ].join(';')
    span.textContent = ln.text
    inner.appendChild(span)
  }
  cell.appendChild(inner)
  return cell
}

function paintRect (doc, placed) {
  const el = doc.createElement('div')
  el.className = 'niqer-report-cell niqer-report-cell--rect'
  el.style.cssText = boxCss(placed, { fallbackBg: (placed.style && (placed.style.backgroundColor || placed.style.fill)) || '#000' })
  return el
}

function paintImage (doc, placed) {
  const pad = resolveMediaPaddingPx(placed)
  const cell = doc.createElement('div')
  cell.className = 'niqer-report-cell niqer-report-cell--image'
  cell.style.cssText = boxCss(placed, { pad, fallbackBg: '#f8f9fa' })
  const src = String(placed.parsedContent || placed.content || '')
  if (src && (src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:') || src.startsWith('/'))) {
    const img = doc.createElement('img')
    img.alt = ''
    img.src = src
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block'
    cell.appendChild(img)
  }
  return cell
}

function symbolRects (placed) {
  const text = String(placed.parsedContent != null ? placed.parsedContent : (placed.content || ''))
  if (!text) return []
  if (placed.type !== 'qrcode' && wantsAdobeUpc(placed)) {
    const layout = layoutAdobeUpc(text, placed)
    if (layout) return { adobe: adobeUpcSvg(layout) }
  }
  const format = placed.type === 'qrcode'
    ? (placed.qrcodeFormat || 'qrcode')
    : (placed.barcodeFormat || 'code128')
  const symbol = encode(text, { format })
  const pad = resolveMediaPaddingPx(placed)
  const innerW = Math.max(1, placed.width - 2 * pad)
  const innerH = Math.max(1, placed.height - 2 * pad)
  const module = Number(placed.barcodeModuleCssPx) > 0
    ? Number(placed.barcodeModuleCssPx)
    : Math.max(1, innerW / Math.max(1, symbol.width || symbol.modules && symbol.modules.length || 1))
  const height = placed.type === 'qrcode' ? module : (Number(placed.barcodeBarHeight) > 0 ? Number(placed.barcodeBarHeight) : innerH)
  return toRects(symbol, { module, height, offsetX: pad, offsetY: pad })
}

function paintBarcode (doc, placed) {
  const pad = resolveMediaPaddingPx(placed)
  const cell = doc.createElement('div')
  cell.className = 'niqer-report-cell niqer-report-cell--' + (placed.type === 'qrcode' ? 'qrcode' : 'barcode')
  cell.style.cssText = boxCss(placed, { pad })
  const spec = symbolRects(placed)
  if (spec && spec.adobe) {
    cell.style.overflow = 'visible'
    cell.insertAdjacentHTML('beforeend', spec.adobe)
    return cell
  }
  const color = colorOf(placed)
  for (const r of spec) {
    const bar = doc.createElement('i')
    bar.style.cssText = [
      'position:absolute',
      'display:block',
      'left:' + px(r.x) + 'px',
      'top:' + px(r.y) + 'px',
      'width:' + px(r.w) + 'px',
      'height:' + px(r.h) + 'px',
      'background:' + color,
      'margin:0'
    ].join(';')
    cell.appendChild(bar)
  }
  return cell
}

function paintPlaced (doc, placed) {
  const t = placed.type
  if (t === 'rect') return paintRect(doc, placed)
  if (t === 'image') return paintImage(doc, placed)
  if (t === 'barcode' || t === 'qrcode') return paintBarcode(doc, placed)
  return paintText(doc, placed)
}

function selectedPages (laid, page) {
  const n = Number(page)
  if (Number.isFinite(n) && n >= 1) {
    const one = laid.pages[n - 1]
    return one ? [one] : []
  }
  return laid.pages
}

export function paintReport (host, laid, opts = {}) {
  const doc = host.ownerDocument
  const scale = Number(opts.scale) > 0 ? Number(opts.scale) : 1
  const paper = laid.paperSize || { width: 794, height: 1123 }
  const root = host.shadowRoot || host
  const style = doc.createElement('style')
  style.textContent = ':host{display:flex;flex-direction:column;gap:12px;align-items:flex-start}i{font-style:normal}'
  root.replaceChildren(style)
  for (const pg of selectedPages(laid, opts.page)) {
    const page = doc.createElement('div')
    page.className = 'niqer-report-page'
    page.style.cssText = [
      'position:relative',
      'width:' + px(paper.width * scale) + 'px',
      'height:' + px(paper.height * scale) + 'px',
      'background:#fff',
      'overflow:hidden',
      scale !== 1 ? ('transform:scale(' + scale + ');transform-origin:top left;width:' + px(paper.width) + 'px;height:' + px(paper.height) + 'px') : ''
    ].filter(Boolean).join(';')
    if (scale !== 1) {
      const wrap = doc.createElement('div')
      wrap.style.cssText = 'width:' + px(paper.width * scale) + 'px;height:' + px(paper.height * scale) + 'px;position:relative'
      for (const el of pg.elements) page.appendChild(paintPlaced(doc, el))
      wrap.appendChild(page)
      root.appendChild(wrap)
    } else {
      for (const el of pg.elements) page.appendChild(paintPlaced(doc, el))
      root.appendChild(page)
    }
  }
  return laid.pages.length
}

export function reportToHtml (template, opts = {}) {
  const laid = opts.laid || layoutReport(template, opts)
  const paper = laid.paperSize || { width: 794, height: 1123 }
  const parts = ['<div class="niqer-report" style="display:flex;flex-direction:column;gap:12px">']
  for (const pg of selectedPages(laid, opts.page)) {
    parts.push('<div class="niqer-report-page" style="position:relative;width:' + px(paper.width) + 'px;height:' + px(paper.height) + 'px;background:#fff;overflow:hidden">')
    // 字符串路径只出结构，条码/字仍走 DOM paint；SSR 用 layout + 自行拼
    for (const el of pg.elements) {
      const t = el.type
      if (t === 'rect') {
        parts.push('<div style="' + boxCss(el, { fallbackBg: (el.style && (el.style.backgroundColor || el.style.fill)) || '#000' }) + '"></div>')
      } else if (t === 'image') {
        const src = String(el.parsedContent || el.content || '')
        parts.push('<div style="' + boxCss(el, { pad: resolveMediaPaddingPx(el) }) + '">' +
          (src ? '<img alt="" src="' + esc(src) + '" style="width:100%;height:100%;object-fit:contain"/>' : '') +
          '</div>')
      } else if (t === 'barcode' || t === 'qrcode') {
        const spec = symbolRects(el)
        parts.push('<div style="' + boxCss(el, { pad: resolveMediaPaddingPx(el) }) + '">')
        if (spec && spec.adobe) parts.push(spec.adobe)
        else {
          for (const r of spec) {
            parts.push('<i style="position:absolute;display:block;left:' + px(r.x) + 'px;top:' + px(r.y) + 'px;width:' + px(r.w) + 'px;height:' + px(r.h) + 'px;background:' + esc(colorOf(el)) + '"></i>')
          }
        }
        parts.push('</div>')
      } else {
        const pad = REPORT_TEXT_PADDING_PX
        const border = resolveBorderWidth(el)
        const fs = resolveFontSizePx(el)
        const es = el.style || {}
        const family = resolveReportFontFamily(es.fontFamily, es.fontWeight, es.fontStyle)
        const align = el.textAlign || 'center'
        const va = el.verticalAlign || 'top'
        const contentW = Math.max(0, el.width - 2 * pad - 2 * border)
        const availH = Math.max(0, el.height - 2 * pad - 2 * border)
        const text = el.parsedContent != null ? el.parsedContent : (el.content || '')
        const lines = wrapTextLines(text, contentW, fs)
        let contentH = 0
        for (const ln of lines) contentH += ln.height
        let vOffset = 0
        if (va === 'center' || va === 'middle') vOffset = Math.max(0, (availH - contentH) / 2)
        else if (va === 'bottom') vOffset = Math.max(0, availH - contentH)
        parts.push('<div style="' + boxCss(el, { pad }) + '"><div style="position:relative;width:100%;height:100%;overflow:hidden">')
        for (const ln of lines) {
          let left = 0
          if (align === 'right') left = Math.max(0, contentW - ln.width)
          else if (align === 'center') left = Math.max(0, (contentW - ln.width) / 2)
          parts.push('<div style="position:absolute;left:' + px(left) + 'px;top:' + px(vOffset + ln.top) + 'px;width:' + px(Math.max(1, ln.width)) + 'px;height:' + px(ln.height) + 'px;line-height:' + px(ln.height) + 'px;white-space:pre;font-size:' + px(fs) + 'px;font-family:' + esc(family) + ';font-weight:' + (resolveFontWeightBold(el) ? '700' : '400') + ';color:' + esc(colorOf(el)) + '">' + esc(ln.text) + '</div>')
        }
        parts.push('</div></div>')
      }
    }
    parts.push('</div>')
  }
  parts.push('</div>')
  return parts.join('')
}
