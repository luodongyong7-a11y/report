import { extractPageLayout, PdfDocument, paintPage } from '@niqer/pdf'
import { uid } from '../designer/model.js'

const SCALE = 96 / 72

function round (n) {
  return Math.round(Number(n) * 100) / 100
}

function fileToDataUrl (file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

export function dataUrlToBase64 (dataUrl) {
  const s = String(dataUrl || '')
  const i = s.indexOf(',')
  return i >= 0 ? s.slice(i + 1) : s
}

export function isPdfFile (file) {
  const name = String(file && file.name || '').toLowerCase()
  return file && (file.type === 'application/pdf' || name.endsWith('.pdf'))
}

export async function pdfToTemplate (bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const layout = extractPageLayout(data, 0)
  const width = round(layout.pageWidthPt * SCALE)
  const height = round(layout.pageHeightPt * SCALE)
  const elements = []
  for (const line of layout.textLines || []) {
    const fontPx = Math.max(1, round(line.fontSize * SCALE))
    elements.push({
      id: uid('text'),
      type: 'text',
      x: round(line.xPt * SCALE),
      y: round(line.yTopPt * SCALE),
      width: Math.max(fontPx, round(line.wPt * SCALE)),
      height: Math.max(fontPx, round(line.hPt * SCALE) || fontPx),
      content: line.content || '',
      textAlign: 'left',
      verticalAlign: 'top',
      style: {
        fontSize: fontPx + 'px',
        fontFamily: 'Arial',
        color: line.color || '#000000'
      }
    })
  }
  for (const img of layout.images || []) {
    const wPt = Number(img.wPt != null ? img.wPt : img.w)
    const hPt = Number(img.hPt != null ? img.hPt : img.h)
    if (!(wPt > 0)) continue
    let content = ''
    if (img.dataUrl) content = img.dataUrl
    else if (img.dataBase64) content = 'data:image/png;base64,' + img.dataBase64
    const xPt = img.xPt != null ? img.xPt : img.minX
    const yTop = img.yTopPt != null ? img.yTopPt : (layout.pageHeightPt - (img.minY || 0) - hPt)
    elements.push({
      id: uid('img'),
      type: 'image',
      x: round((xPt || 0) * SCALE),
      y: round((yTop || 0) * SCALE),
      width: round(wPt * SCALE),
      height: round((hPt || wPt) * SCALE),
      content
    })
  }
  return {
    id: '',
    printKind: 'label',
    paperSize: { width, height },
    paperPreset: 'CUSTOM',
    paperOrientation: width > height ? 'landscape' : 'portrait',
    customPaperSize: { width, height },
    customPaperSizeMm: {
      width: round(layout.pageWidthPt * 25.4 / 72),
      height: round(layout.pageHeightPt * 25.4 / 72)
    },
    headerY: height,
    footerY: height,
    summaryA: height,
    summaryB: height,
    summaryEnabled: false,
    elements,
    param: {},
    dataset: {},
    embeddedFonts: Array.isArray(layout.embeddedFonts) ? layout.embeddedFonts : undefined
  }
}

export async function previewPdfBackground (bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const doc = PdfDocument.open(data)
  const page = doc.getPages()[0]
  if (!page) return null
  const scale = SCALE
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(page.width * scale))
  canvas.height = Math.max(1, Math.ceil(page.height * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await paintPage(page, ctx, { scale })
  return {
    previewDataUrl: canvas.toDataURL('image/png'),
    widthPx: canvas.width,
    heightPx: canvas.height,
    widthPt: page.width,
    heightPt: page.height
  }
}

export async function fileToBackground (file) {
  const PT_TO_MM = 25.4 / 72
  if (isPdfFile(file)) {
    const dataUrl = await fileToDataUrl(file)
    const buf = await file.arrayBuffer()
    const preview = await previewPdfBackground(buf)
    return {
      kind: 'pdf',
      fileName: file.name,
      dataBase64: dataUrlToBase64(dataUrl),
      previewDataUrl: preview?.previewDataUrl || '',
      widthPx: preview?.widthPx || 0,
      heightPx: preview?.heightPx || 0,
      widthMm: preview ? round(preview.widthPt * PT_TO_MM) : 0,
      heightMm: preview ? round(preview.heightPt * PT_TO_MM) : 0
    }
  }
  const dataUrl = await fileToDataUrl(file)
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('image'))
    el.src = dataUrl
  })
  return {
    kind: 'image',
    fileName: file.name,
    mime: file.type || 'image/png',
    dataBase64: dataUrlToBase64(dataUrl),
    previewDataUrl: dataUrl,
    widthPx: img.naturalWidth,
    heightPx: img.naturalHeight,
    widthMm: round(img.naturalWidth * 25.4 / 96),
    heightMm: round(img.naturalHeight * 25.4 / 96)
  }
}

export { fileToDataUrl }
