import { paintToContext } from '@niqer/barcode'
import {
  barcodeBwipDrawOptions,
  barcodeHriLayout,
  encodeBarcodeSymbol,
  layoutAdobeUpc,
  matrixFitGeometry,
  resolveBarcodeFormat,
  wantsAdobeUpc
} from '../barcodeGrade.js'
import { defaultMediaPaddingPx, resolveMediaPaddingPx } from '../fontPolicy.js'

function canvasDeviceScale () {
  if (typeof window === 'undefined') return 1
  const dpr = Number(window.devicePixelRatio) || 1
  return Math.min(3, Math.max(1, dpr))
}

function prepareCanvas (canvas, cssW, cssH) {
  const dpr = canvasDeviceScale()
  const w = Math.max(1, Math.round(cssW))
  const h = Math.max(1, Math.round(cssH))
  canvas.width = Math.max(1, Math.round(w * dpr))
  canvas.height = Math.max(1, Math.round(h * dpr))
  if (canvas.style) {
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false
  return { ctx, w, h, dpr }
}

export function previewQrCanvasSize (element) {
  const pad = resolveMediaPaddingPx(Object.assign({}, element, { type: 'qrcode' }))
  return Math.max(10, Math.min(element.width || 100, element.height || 100) - 2 * pad)
}

function canvasFontFamily (name) {
  const n = String(name || 'Arial').trim()
  if (/^ocr-?b$/i.test(n)) return '"OCR-B", OCRB, Arial, sans-serif'
  if (/^ocr-?a$/i.test(n) || /ocr a/i.test(n)) return '"OCR-A", "OCR A Extended", OCRA, Arial, sans-serif'
  if (!n || /^arial(mt)?$/i.test(n)) return '"ArialMT", Arial, Helvetica, sans-serif'
  if (/arial-bolditalicmt/i.test(n) || (/arial/i.test(n) && /bold/i.test(n) && /italic/i.test(n))) {
    return '"Arial-BoldItalicMT", Arial, Helvetica, sans-serif'
  }
  if (/arial-boldmt/i.test(n) || (/arial/i.test(n) && /bold/i.test(n))) {
    return '"Arial-BoldMT", Arial, Helvetica, sans-serif'
  }
  if (/arial-italicmt/i.test(n) || (/arial/i.test(n) && /italic/i.test(n))) {
    return '"Arial-ItalicMT", Arial, Helvetica, sans-serif'
  }
  return n + ', Helvetica, sans-serif'
}

function paintGlyphs (ctx, glyphs, opts) {
  if (!glyphs || !glyphs.length) return
  const s = opts.scale > 0 ? opts.scale : 1
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = opts.color
  for (const g of glyphs) {
    const align = g.align === 'right' ? 'right' : (g.align === 'start' || g.align === 'left' ? 'left' : 'center')
    ctx.textAlign = align
    ctx.font = (g.fontSize || 12) * s + 'px ' + canvasFontFamily(opts.fontFamily)
    const x = (align === 'center' ? g.x + g.width / 2 : align === 'right' ? g.x + g.width : g.x) * s
    const y = g.baseline * s
    const sx = Number(g.scaleX)
    if (Number.isFinite(sx) && Math.abs(sx - 1) > 0.02) {
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(sx, 1)
      ctx.fillText(g.text, 0, 0)
      ctx.restore()
    } else {
      ctx.fillText(g.text, x, y)
    }
  }
}

function paintOwnToCanvas (canvas, parsedContent, element) {
  const packed = barcodeBwipDrawOptions(parsedContent, element)
  const symbol = encodeBarcodeSymbol(
    packed.content,
    packed.format,
    element && (element.qrcodeEcc || element.eccLevel)
  )
  const pad = resolveMediaPaddingPx(element)
  const elW = Math.max(10, (Number(element && element.width) || packed.layoutWidth) - 2 * pad)
  const elH = Math.max(10, (Number(element && element.height) || packed.layoutHeight) - 2 * pad)
  const { ctx } = prepareCanvas(canvas, elW, elH)
  ctx.fillStyle = packed.background || '#ffffff'
  ctx.fillRect(0, 0, elW, elH)
  ctx.fillStyle = packed.lineColor || packed.color || '#000000'
  if (!symbol) return
  if (symbol.kind === 'matrix') {
    const fit = matrixFitGeometry(symbol, elW, elH, packed.format)
    paintToContext(ctx, symbol, {
      module: fit.module,
      offsetX: fit.offsetX,
      offsetY: fit.offsetY
    })
    return
  }
  const n = Math.max(1, (symbol.modules && symbol.modules.length) || 1)
  const band = packed.displayValue
    ? (Number(packed.fontSize) || 0) + (Number(packed.textMargin) || 0) + (Number(packed.marginBottom) || 0)
    : 0
  const barH = Math.max(1, elH - band)
  const module = elW / n
  paintToContext(ctx, symbol, {
    module,
    height: barH,
    offsetX: 0,
    offsetY: 0
  })
  if (packed.displayValue) {
    const laid = barcodeHriLayout(parsedContent, element)
    const sx = n * (Number(packed.moduleCssPx) || 1)
    const scale = sx > 0 ? elW / sx : 1
    paintGlyphs(ctx, laid.glyphs, {
      color: packed.lineColor || packed.color || '#000000',
      fontFamily: packed.font || (element && element.barcodeFont) || 'Arial',
      scale
    })
  }
}

export function drawPreviewQrToCanvas (canvas, parsedContent, element) {
  const bcid = resolveBarcodeFormat({
    barcodeFormat: (element && (element.qrcodeFormat || element.barcodeFormat)) || 'qrcode'
  })
  paintOwnToCanvas(canvas, parsedContent, Object.assign({}, element, {
    type: 'barcode',
    barcodeFormat: bcid,
    barcodeDisplayValue: false,
    displayValue: false,
    padding: element && element.padding != null ? element.padding : defaultMediaPaddingPx('qrcode'),
    width: Math.max(10, Number(element && element.width) || previewQrCanvasSize(element)),
    height: Math.max(10, Number(element && element.height) || previewQrCanvasSize(element))
  }))
}

function paintAdobeUpcToCanvas (canvas, layout) {
  const cssW = Math.max(1, layout.width)
  const cssH = Math.max(1, layout.height)
  const { ctx } = prepareCanvas(canvas, cssW, cssH)
  ctx.clearRect(0, 0, cssW, cssH)
  ctx.fillStyle = layout.color
  for (const b of layout.bars) {
    ctx.fillRect(b.x, b.y, b.w, b.h)
  }
  paintGlyphs(ctx, layout.glyphs, {
    color: layout.color,
    fontFamily: layout.fontFamily || 'Arial',
    scale: 1
  })
}

export function drawPreviewBarcodeToCanvas (canvas, parsedContent, element) {
  if (wantsAdobeUpc(element)) {
    const pad = resolveMediaPaddingPx(element)
    const inner = Object.assign({}, element, {
      width: Math.max(10, (Number(element && element.width) || 0) - 2 * pad),
      height: Math.max(10, (Number(element && element.height) || 0) - 2 * pad)
    })
    const layout = layoutAdobeUpc(parsedContent, inner)
    if (layout) {
      paintAdobeUpcToCanvas(canvas, layout)
      return
    }
  }
  paintOwnToCanvas(canvas, parsedContent, element)
}
