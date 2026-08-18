import { encode, toRects } from '@niqer/barcode'
import { PdfDocument } from '@niqer/pdf'
import { PT_PER_PX, resolveMediaPaddingPx } from '../fontPolicy.js'
import { layoutAdobeUpc, wantsAdobeUpc } from '../upcAdobe.js'
import { layoutReport } from './placed.js'
import {
  resolveBorderWidth,
  resolveFontSizePx,
  wrapTextLines
} from './measure.js'

function pt (px) {
  return Number(px) * PT_PER_PX
}

function pageY (pageH, yPx, hPx) {
  return pageH - pt(yPx) - pt(hPx)
}

function fillOf (placed, fallback) {
  if (placed.fill) return placed.fill
  const s = placed.style || {}
  return s.backgroundColor || s.fill || fallback || null
}

function drawBorder (page, placed, pageH) {
  const w = resolveBorderWidth(placed)
  if (!w) return
  const c = (placed.border && placed.border.color) || '#000'
  page.drawRect({
    x: pt(placed.x),
    y: pageY(pageH, placed.y, placed.height),
    width: pt(placed.width),
    height: pt(placed.height),
    stroke: c,
    lineWidth: pt(w)
  })
}

function drawText (page, placed, pageH) {
  const bg = fillOf(placed, null)
  if (bg) {
    page.drawRect({
      x: pt(placed.x),
      y: pageY(pageH, placed.y, placed.height),
      width: pt(placed.width),
      height: pt(placed.height),
      fill: bg
    })
  }
  drawBorder(page, placed, pageH)
  const pad = 1
  const border = resolveBorderWidth(placed)
  const fsPx = resolveFontSizePx(placed)
  const fs = pt(fsPx)
  const contentW = Math.max(0, placed.width - 2 * pad - 2 * border)
  const availH = Math.max(0, placed.height - 2 * pad - 2 * border)
  const text = placed.parsedContent != null ? placed.parsedContent : (placed.content || '')
  const lines = wrapTextLines(text, contentW, fsPx)
  let contentH = 0
  for (const ln of lines) contentH += ln.height
  const va = placed.verticalAlign || 'top'
  const align = placed.textAlign || 'center'
  let vOffset = 0
  if (va === 'center' || va === 'middle') vOffset = Math.max(0, (availH - contentH) / 2)
  else if (va === 'bottom') vOffset = Math.max(0, availH - contentH)
  const color = (placed.style && placed.style.color) || '#000'
  page.setFillColor(color)
  for (const ln of lines) {
    let left = pad + border
    if (align === 'right') left = pad + border + Math.max(0, contentW - ln.width)
    else if (align === 'center') left = pad + border + Math.max(0, (contentW - ln.width) / 2)
    const topPx = placed.y + pad + border + vOffset + ln.top
    page.drawText(ln.text, {
      x: pt(placed.x + left),
      y: pageH - pt(topPx + fsPx),
      fontSize: fs
    })
  }
}

function drawRect (page, placed, pageH) {
  page.drawRect({
    x: pt(placed.x),
    y: pageY(pageH, placed.y, placed.height),
    width: pt(placed.width),
    height: pt(placed.height),
    fill: fillOf(placed, '#000')
  })
}

function b64ToU8 (b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'))
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function drawImage (doc, page, placed, pageH) {
  drawBorder(page, placed, pageH)
  const src = String(placed.parsedContent || placed.content || '')
  const m = src.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i)
  if (!m) return
  const bytes = b64ToU8(m[2])
  const embedded = /png/i.test(m[1]) ? doc.embedPng(bytes) : doc.embedJpeg(bytes)
  const pad = resolveMediaPaddingPx(placed)
  page.drawImage(embedded.name, {
    x: pt(placed.x + pad),
    y: pageY(pageH, placed.y + pad, placed.height - 2 * pad),
    width: pt(Math.max(1, placed.width - 2 * pad)),
    height: pt(Math.max(1, placed.height - 2 * pad))
  })
}

function barcodeRects (placed) {
  const text = String(placed.parsedContent != null ? placed.parsedContent : (placed.content || ''))
  if (!text) return { rects: [], glyphs: [] }
  if (placed.type !== 'qrcode' && wantsAdobeUpc(placed)) {
    const layout = layoutAdobeUpc(text, placed)
    if (layout && layout.bars) {
      return { rects: layout.bars, glyphs: layout.glyphs || [], color: layout.color }
    }
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
    : Math.max(1, innerW / Math.max(1, symbol.width || (symbol.modules && symbol.modules.length) || 1))
  const height = placed.type === 'qrcode' ? module : (Number(placed.barcodeBarHeight) > 0 ? Number(placed.barcodeBarHeight) : innerH)
  return { rects: toRects(symbol, { module, height, offsetX: pad, offsetY: pad }), glyphs: [] }
}

function drawBarcode (page, placed, pageH) {
  drawBorder(page, placed, pageH)
  const spec = barcodeRects(placed)
  const color = spec.color || (placed.style && placed.style.color) || '#000'
  for (const r of spec.rects) {
    page.drawRect({
      x: pt(placed.x + r.x),
      y: pageY(pageH, placed.y + r.y, r.h),
      width: pt(r.w),
      height: pt(r.h),
      fill: color
    })
  }
  for (const g of spec.glyphs) {
    page.drawText(g.text, {
      x: pt(placed.x + g.x),
      y: pageH - pt(placed.y + g.baseline),
      fontSize: pt(g.fontSize || 12),
      scaleX: g.scaleX
    })
  }
}

function drawPlaced (doc, page, placed, pageH) {
  const t = placed.type
  if (t === 'rect') {
    drawRect(page, placed, pageH)
    return
  }
  if (t === 'image') {
    drawImage(doc, page, placed, pageH)
    return
  }
  if (t === 'barcode' || t === 'qrcode') {
    drawBarcode(page, placed, pageH)
    return
  }
  drawText(page, placed, pageH)
}

/** 模板或已 layout 的结果写成 PDF 字节。 */
export function reportToPdf (template, opts = {}) {
  const laid = opts.laid || layoutReport(template, opts)
  const paper = laid.paperSize || { width: 794, height: 1123 }
  const pageW = pt(paper.width)
  const pageH = pt(paper.height)
  const doc = PdfDocument.create({ version: '1.6' })
  const pages = laid.pages || []
  const only = Number(opts.page)
  const list = (Number.isFinite(only) && only >= 1)
    ? pages.filter((_, i) => i === only - 1)
    : pages
  if (list.length === 0) doc.addPage({ width: pageW, height: pageH })
  for (const pg of list) {
    const page = doc.addPage({ width: pageW, height: pageH })
    for (const el of pg.elements) drawPlaced(doc, page, el, pageH)
  }
  return doc.save()
}
