// 绘制:把 paginate 产出的 pages 用 @niqer/pdf 画成多页 PDF。
// 规格是本文件原 pdfkit 路径:run 切分、napi 测宽、border-collapse、underline/strike、合成粗斜。
// 只换绘制后端,禁止用 oss/niqer-report/src/render/pdf.js 替换。
// 坐标系:@niqer/pdf 底原点,yPdf = pageH - yTop*PX2PT;drawGlyphs 的 y 是基线;drawRect/clipRect 的 y 是底边。
import './fonts.mjs'
import { PDF_FACE, resolveFace, SYNTH, FONT_BUFFERS, FONT_PATHS } from './fonts.mjs'
import { PX2PT, splitRuns, napiWidth } from './metrics.mjs'
import { measureCell, REPORT_TEXT_PADDING_PX, resolveFontWeight, resolveFontStyle, resolveBorderWidth } from './measure.mjs'
import { REPORT_MEDIA_PADDING_PX, fontKeyForFamily } from './font-policy.mjs'
import {
  generateMediaBuffer,
  imageDimensions,
  previewBarcodeCanvasSize,
  previewQrCanvasSize
} from './media.mjs'
import { computeCollapsedBorders } from './border-collapse.mjs'
import { PdfDocument, openSfnt, glyphId, advanceWidth, sanitizeWebSfnt, createSubset } from '@niqer/pdf'
import { encode, toRects } from '@niqer/barcode'
import fs from 'node:fs'

const FACE_FILE = {
  times: 'times',
  timesBd: 'timesBd',
  timesIt: 'timesIt',
  timesBi: 'timesBi',
  song: 'simsun',
  hei: 'simhei',
  symbol: 'segoesym'
}

function asBytes (src) {
  if (!src) return null
  if (src instanceof Uint8Array) return src
  return new Uint8Array(src)
}

function isTtc (bytes) {
  return bytes && bytes.length >= 4 &&
    bytes[0] === 0x74 && bytes[1] === 0x74 && bytes[2] === 0x63 && bytes[3] === 0x66
}

function hex6 (color) {
  if (!color || typeof color !== 'string') return '#000000'
  const s = color.trim()
  if (s[0] === '#' && s.length === 4) {
    return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]
  }
  return s
}

function ttfForFace (pdfName) {
  const fileKey = FACE_FILE[pdfName] || 'times'
  let raw = asBytes(FONT_BUFFERS[fileKey])
  if (!raw) {
    const p = FONT_PATHS[fileKey]
    if (p && fs.existsSync(p)) raw = asBytes(fs.readFileSync(p))
  }
  const faceName = PDF_FACE[fileKey]
  if (raw && (isTtc(raw) || fileKey === 'simsun')) {
    const cleaned = sanitizeWebSfnt(raw, faceName || 'SimSun')
    try {
      openSfnt(cleaned, faceName || 'SimSun')
      return { bytes: asBytes(cleaned), faceName: faceName || 'SimSun' }
    } catch {
      const hei = asBytes(FONT_BUFFERS.simhei)
      if (hei) return { bytes: hei, faceName: PDF_FACE.simhei }
      return null
    }
  }
  if (!raw) {
    if (pdfName === 'song') {
      const hei = asBytes(FONT_BUFFERS.simhei)
      if (hei) return { bytes: hei, faceName: PDF_FACE.simhei }
    }
    return null
  }
  return { bytes: raw, faceName }
}

const WATERMARK_TEXT = '免费版'

function collectUsedFaces (pages, watermark) {
  const used = new Map()
  const add = (pdfName, text) => {
    if (!pdfName || !text) return
    let set = used.get(pdfName)
    if (!set) { set = new Set(); used.set(pdfName, set) }
    for (const ch of String(text)) set.add(ch.codePointAt(0))
  }
  add('times', '[image][qrcode][barcode] ')
  if (watermark) add('song', WATERMARK_TEXT)
  for (const page of pages) {
    for (const placed of page.elements) {
      if (placed.type !== 'text' && placed.type !== 'data') continue
      const primary = fontKeyForFamily(placed.style && placed.style.fontFamily)
      const bold = resolveFontWeight(placed)
      const italic = resolveFontStyle(placed)
      const m = measureCell(placed, { autoGrow: false })
      for (const ln of m.lines) {
        for (const run of splitRuns(ln.text, primary)) {
          const face = resolveFace(run.fontKey, bold, italic)
          add(face.pdfName, run.text)
        }
      }
    }
  }
  return used
}

function embedFaces (doc, used) {
  const faces = {}
  for (const [pdfName, cps] of used) {
    const src = ttfForFace(pdfName)
    if (!src) continue
    const full = openSfnt(src.bytes, src.faceName)
    const sub = createSubset(full)
    for (const cp of cps) sub.includeGlyph(glyphId(full, cp), cp)
    const subsetBytes = sub.encode()
    const sfnt = openSfnt(subsetBytes)
    const widths = []
    const cmap = new Map()
    for (const cp of cps) {
      const gid = glyphId(sfnt, cp)
      cmap.set(gid, cp)
      widths[gid] = Math.round(advanceWidth(sfnt, gid) / (sfnt.em || 1000) * 1000)
    }
    if (!cmap.has(0)) {
      cmap.set(0, 0)
      widths[0] = Math.round(advanceWidth(sfnt, 0) / (sfnt.em || 1000) * 1000)
    }
    const key = doc.embedFont(subsetBytes, pdfName, {
      key: pdfName,
      cid: true,
      widths,
      cmap,
      defaultWidth: 1000
    })
    faces[pdfName] = {
      key,
      sfnt,
      ascent1000: (sfnt.hheaMetrics.ascent / (sfnt.em || 1000)) * 1000
    }
  }
  return faces
}

function glyphsHex (sfnt, text) {
  let hex = ''
  for (const ch of String(text)) {
    hex += glyphId(sfnt, ch.codePointAt(0)).toString(16).padStart(4, '0')
  }
  return hex
}

function rectPdf (xPx, yPx, wPx, hPx, pageHpt) {
  return {
    x: xPx * PX2PT,
    y: pageHpt - (yPx + hPx) * PX2PT,
    width: wPx * PX2PT,
    height: hPx * PX2PT
  }
}

function applyBorderDash (page, style, borderPx) {
  if (style === 'dashed') page.setDash(Math.max(2, borderPx * 2) * PX2PT, Math.max(2, borderPx * 1.5) * PX2PT)
  else if (style === 'dotted') page.setDash(Math.max(1, borderPx) * PX2PT, Math.max(1, borderPx * 1.5) * PX2PT)
}

function strokeBorderSegment (page, pageHpt, seg) {
  const { orient, left, top, len, bw, color, style } = seg
  const hb = bw / 2
  page.saveGState()
  applyBorderDash(page, style, bw)
  page.setLineWidth(bw * PX2PT)
  page.setStrokeColor(hex6(color))
  if (orient === 'v') {
    const cx = (left + hb) * PX2PT
    page.moveTo(cx, pageHpt - top * PX2PT)
    page.lineTo(cx, pageHpt - (top + len) * PX2PT)
    page.stroke()
  } else {
    const cy = pageHpt - (top + hb) * PX2PT
    page.moveTo(left * PX2PT, cy)
    page.lineTo((left + len) * PX2PT, cy)
    page.stroke()
  }
  page.restoreGState()
}

function drawLineRuns (page, pageHpt, faces, lineText, startXpt, yTopPx, fontSizePx, primary, opts = {}) {
  const { bold = false, italic = false, color = '#000', underline = false, strike = false } = opts
  let x = startXpt
  const sizePt = fontSizePx * PX2PT
  const runs = splitRuns(lineText, primary)
  const strut = faces[primary] || faces.times
  const ascent1000 = strut ? strut.ascent1000 : 800
  const baselineFromTop = yTopPx * PX2PT + ascent1000 / 1000 * sizePt
  const baselinePdf = pageHpt - baselineFromTop
  const boldDx = Math.max(0.2, sizePt * SYNTH.boldOffsetRatio)
  const fill = hex6(color)
  for (const run of runs) {
    const face = resolveFace(run.fontKey, bold, italic)
    const packed = faces[face.pdfName] || faces.times
    const advance = napiWidth(run.text, face.napiAlias, fontSizePx) * PX2PT
    if (packed) {
      const hex = glyphsHex(packed.sfnt, run.text)
      const paint = (dx) => {
        page.setFillColor(fill)
        page.drawGlyphs(hex, { font: packed.key, fontSize: sizePt, x: x + dx, y: baselinePdf })
      }
      if (face.synthItalic) {
        page.saveGState()
        page.transform(1, 0, SYNTH.italicSkew, 1, -SYNTH.italicSkew * baselinePdf, 0)
        paint(0)
        if (face.synthBold) paint(boldDx)
        page.restoreGState()
      } else {
        paint(0)
        if (face.synthBold) paint(boldDx)
      }
    }
    x += advance
  }
  if (underline || strike) {
    page.saveGState()
    page.setStrokeColor(fill)
    page.setLineWidth(Math.max(0.4, sizePt * 0.05))
    if (underline) {
      const uy = pageHpt - (baselineFromTop + sizePt * 0.12)
      page.moveTo(startXpt, uy)
      page.lineTo(x, uy)
      page.stroke()
    }
    if (strike) {
      const sy = pageHpt - (baselineFromTop - sizePt * 0.26)
      page.moveTo(startXpt, sy)
      page.lineTo(x, sy)
      page.stroke()
    }
    page.restoreGState()
  }
  return x
}

function drawTextCell (page, pageHpt, faces, placed) {
  const m = measureCell(placed, { autoGrow: false })
  const { fontSizePx, pad, border, lines, contentHeight } = m
  const align = placed.textAlign || 'center'
  const primaryFontKey = fontKeyForFamily(placed.style && placed.style.fontFamily)
  const bold = resolveFontWeight(placed)
  const italic = resolveFontStyle(placed)
  const color = (placed.style && placed.style.color) || '#000'
  const deco = (placed.style && placed.style.textDecoration) || 'none'
  const underline = deco === 'underline'
  const strike = deco === 'line-through'

  const xPx = placed.x
  const yPx = placed.y
  const wPx = placed.width
  const hPx = placed.height

  const bg = placed.fill || (placed.style && placed.style.backgroundColor)
  if (bg && typeof bg === 'string' && !bg.includes('gradient')) {
    page.drawRect({ ...rectPdf(xPx, yPx, wPx, hPx, pageHpt), fill: hex6(bg) })
  }
  const contentLeftPt = (xPx + border + pad) * PX2PT
  const contentRightPt = (xPx + wPx - border - pad) * PX2PT
  const availHeightPx = hPx - 2 * pad - 2 * border

  let vOffset = 0
  const va = placed.verticalAlign
  if (va === 'center') vOffset = (availHeightPx - contentHeight) / 2
  else if (va === 'bottom') vOffset = availHeightPx - contentHeight

  const contentTopPx = yPx + border + pad + vOffset
  const clip = rectPdf(xPx + border + pad, yPx + border + pad, wPx - 2 * border - 2 * pad, availHeightPx, pageHpt)
  page.saveGState()
  page.clipRect(clip.x, clip.y, clip.width, clip.height)
  for (const ln of lines) {
    const wPt = ln.width * PX2PT
    let startXpt
    if (align === 'right') startXpt = contentRightPt - wPt
    else if (align === 'center') startXpt = contentLeftPt + ((contentRightPt - contentLeftPt) - wPt) / 2
    else startXpt = contentLeftPt
    drawLineRuns(page, pageHpt, faces, ln.text, startXpt, contentTopPx + ln.top, fontSizePx, primaryFontKey, {
      bold, italic, color, underline, strike
    })
  }
  page.restoreGState()
}

function barcodeGeometry (placed) {
  if (placed.type === 'qrcode') {
    const size = previewQrCanvasSize(placed)
    return { natW: size, natH: size, format: 'qrcode', moduleFor: (symbol) => size / Math.max(1, symbol.width), height: size }
  }
  const { containerW, containerH } = previewBarcodeCanvasSize(placed)
  return {
    natW: containerW,
    natH: containerH,
    format: placed.barcodeFormat || (placed.original && placed.original.barcodeFormat) || 'code128',
    moduleFor: (symbol) => {
      const modules = symbol.modules && symbol.modules.length ? symbol.modules.length : (symbol.width || 1)
      return containerW / Math.max(1, modules)
    },
    height: containerH
  }
}

function drawBarcodeVectors (page, pageHpt, placed, drawX, drawY, scale) {
  const content = placed.parsedContent
  if (!content) return false
  try {
    const geo = barcodeGeometry(placed)
    const symbol = encode(String(content), { format: geo.format })
    const rects = toRects(symbol, { module: geo.moduleFor(symbol), height: geo.height })
    const color = hex6((placed.style && placed.style.color) || '#000000')
    for (const r of rects) {
      page.drawRect({
        ...rectPdf(drawX + r.x * scale, drawY + r.y * scale, r.w * scale, r.h * scale, pageHpt),
        fill: color
      })
    }
    return true
  } catch {
    return false
  }
}

function embedRaster (doc, buffer) {
  if (!buffer || buffer.length < 4) return null
  try {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return doc.embedPng(buffer)
    }
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      return doc.embedJpeg(buffer)
    }
  } catch {
    return null
  }
  return null
}

function drawMediaCell (page, pageHpt, faces, doc, placed) {
  const xPx = placed.x, yPx = placed.y, wPx = placed.width, hPx = placed.height
  const pad = REPORT_MEDIA_PADDING_PX
  const border = resolveBorderWidth(placed)

  let bg = placed.fill
  if (!bg) bg = placed.type === 'image' ? null : '#f8f9fa'
  if (bg && typeof bg === 'string' && !bg.includes('gradient')) {
    page.drawRect({ ...rectPdf(xPx, yPx, wPx, hPx, pageHpt), fill: hex6(bg) })
  }
  const innerXPx = xPx + border + pad
  const innerYPx = yPx + border + pad
  const innerWPx = wPx - 2 * border - 2 * pad
  const innerHPx = hPx - 2 * border - 2 * pad
  if (innerWPx <= 0 || innerHPx <= 0) return

  if (placed.type === 'qrcode' || placed.type === 'barcode') {
    const geo = barcodeGeometry(placed)
    const scale = Math.min(innerWPx / geo.natW, innerHPx / geo.natH)
    const dispW = Math.max(1, geo.natW * scale)
    const dispH = Math.max(1, geo.natH * scale)
    const drawX = innerXPx + (innerWPx - dispW) / 2
    const drawY = innerYPx + (innerHPx - dispH) / 2
    if (drawBarcodeVectors(page, pageHpt, placed, drawX, drawY, scale)) return
  } else if (placed.__img) {
    const dim = imageDimensions(placed.__img)
    const natW = dim ? Math.max(1, dim.width) : innerWPx
    const natH = dim ? Math.max(1, dim.height) : innerHPx
    const scale = Math.min(innerWPx / natW, innerHPx / natH)
    const dispW = Math.max(1, natW * scale)
    const dispH = Math.max(1, natH * scale)
    const drawX = innerXPx + (innerWPx - dispW) / 2
    const drawY = innerYPx + (innerHPx - dispH) / 2
    const img = embedRaster(doc, placed.__img)
    if (img) {
      const box = rectPdf(drawX, drawY, dispW, dispH, pageHpt)
      page.drawImage(img.name, { x: box.x, y: box.y, width: box.width, height: box.height })
      return
    }
  }

  const label = `[${placed.type}]`
  const packed = faces.times
  if (packed) {
    page.setFillColor('#666666')
    page.drawGlyphs(glyphsHex(packed.sfnt, label), {
      font: packed.key,
      fontSize: 9 * PX2PT,
      x: innerXPx * PX2PT,
      y: pageHpt - (yPx + hPx / 2 - 6) * PX2PT - (packed.ascent1000 / 1000) * (9 * PX2PT)
    })
  }
}

function drawElement (page, pageHpt, faces, doc, placed) {
  if (placed.type === 'text' || placed.type === 'data') drawTextCell(page, pageHpt, faces, placed)
  else drawMediaCell(page, pageHpt, faces, doc, placed)
}

function watermarkTextWidth (sfnt, text, sizePt) {
  let w = 0
  const em = sfnt.em || 1000
  for (const ch of String(text)) {
    w += advanceWidth(sfnt, glyphId(sfnt, ch.codePointAt(0))) / em * sizePt
  }
  return w
}

function drawWatermark (page, pageWpt, pageHpt, faces) {
  const packed = faces.song || faces.hei
  if (!packed) return
  const hex = glyphsHex(packed.sfnt, WATERMARK_TEXT)
  const sizePt = Math.max(12, Math.min(16.5, Math.min(pageWpt, pageHpt) * 0.026))
  const tw = watermarkTextWidth(packed.sfnt, WATERMARK_TEXT, sizePt)
  const ascent = (packed.ascent1000 / 1000) * sizePt
  const crop = sizePt * 0.35
  const halfAabb = (tw + ascent) * Math.SQRT1_2 / 2
  const a = Math.SQRT1_2
  const b = -Math.SQRT1_2
  const c = Math.SQRT1_2
  const d = Math.SQRT1_2
  const cx = pageWpt - halfAabb + crop
  const cy = pageHpt - halfAabb + crop
  const x = cx - (tw / 2) * a - (ascent / 2) * c
  const y = cy - (tw / 2) * b - (ascent / 2) * d
  page.saveGState()
  page.setFillOpacity(0.28)
  page.setFillColor('#000000')
  page.drawGlyphs(hex, {
    font: packed.key,
    fontSize: sizePt,
    matrix: [a, b, c, d, x, y]
  })
  page.restoreGState()
}

export async function renderPagesToPdfBuffer ({ pages, paperSize, watermark }) {
  for (const page of pages) {
    for (const placed of page.elements) {
      if (placed.type === 'image') {
        placed.__img = await generateMediaBuffer(placed)
      }
    }
  }

  const pageWpt = paperSize.width * PX2PT
  const pageHpt = paperSize.height * PX2PT
  const doc = PdfDocument.create()
  const faces = embedFaces(doc, collectUsedFaces(pages, watermark))

  if (!pages.length) doc.addPage({ width: pageWpt, height: pageHpt })
  for (const page of pages) {
    const pdfPage = doc.addPage({ width: pageWpt, height: pageHpt })
    for (const placed of page.elements) drawElement(pdfPage, pageHpt, faces, doc, placed)
    const borders = computeCollapsedBorders(page.elements)
    for (const segs of borders) for (const seg of segs) strokeBorderSegment(pdfPage, pageHpt, seg)
    if (watermark) drawWatermark(pdfPage, pageWpt, pageHpt, faces)
  }

  const bytes = doc.save()
  return Buffer.from(bytes)
}

export async function renderPagesToPdf ({ pages, paperSize, outPath }) {
  const buffer = await renderPagesToPdfBuffer({ pages, paperSize })
  fs.writeFileSync(outPath, buffer)
  return { outPath, bytes: buffer.length, pageCount: pages.length }
}

export { REPORT_TEXT_PADDING_PX }
