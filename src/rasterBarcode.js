/**
 * Raster print: keep the customer PDF as a bitmap, replace only the linear
 * barcode with a Grade-A native symbol of the SAME format and content.
 * Match-key / PO is not a barcode payload.
 */
import { decode } from '@niqer/barcode'
import { coerceBarcodeSymbology, inferRetailBarcodeFormat, isUpcFamilyFormat } from './barcodeGrade.js'

const PDF_CSS_SCALE = 96 / 72
const BARCODE_VALUE_FIELDS = ['UPC', 'EAN', 'GTIN', 'BARCODE', '条码']
const MIN_BARS = 12
const MIN_BAR_HEIGHT_PX = 10
const MAX_BAR_WIDTH_PX = 18
const BAR_ASPECT = 3
const VERTICAL_OVERLAP_RATIO = 0.55

function pickRowField (row, cands) {
  if (!row || typeof row !== 'object') return ''
  const lower = new Map(Object.keys(row).map((k) => [String(k).toLowerCase(), k]))
  for (const c of cands) {
    const hit = lower.get(String(c).toLowerCase())
    if (hit) return hit
  }
  return ''
}

function looksRetailUpc (value) {
  const d = String(value || '').replace(/\D/g, '')
  return d.length === 11 || d.length === 12 || d.length === 13
}

function isDarkFill (fill) {
  const s = String(fill || '#000000').trim().toLowerCase()
  if (s === '#000' || s === '#000000' || s === 'black') return true
  const m = s.match(/^#([0-9a-f]{6})$/)
  if (!m) return true
  const n = parseInt(m[1], 16)
  return ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3 < 90
}

function median (values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function pathToCssShape (path, pageHeightPt) {
  const minX = Number(path.minX) || 0
  const minY = Number(path.minY) || 0
  const w = Number(path.w) || 0
  const h = Number(path.h) || 0
  return {
    x: minX * PDF_CSS_SCALE,
    y: (Number(pageHeightPt) - minY - h) * PDF_CSS_SCALE,
    w: w * PDF_CSS_SCALE,
    h: h * PDF_CSS_SCALE,
    color: path.fill
  }
}

function isBarShape (shape) {
  return shape.h >= MIN_BAR_HEIGHT_PX &&
    shape.h >= shape.w * BAR_ASPECT &&
    shape.w <= MAX_BAR_WIDTH_PX &&
    isDarkFill(shape.color)
}

function findBarcodeClusters (shapes) {
  const bars = (shapes || []).filter(isBarShape).sort((a, b) => a.x - b.x)
  const clusters = []
  for (const bar of bars) {
    const top = bar.y
    const bottom = bar.y + bar.h
    const match = clusters.find((cluster) => {
      const overlap = Math.min(cluster.bottom, bottom) - Math.max(cluster.top, top)
      if (overlap < Math.min(cluster.bottom - cluster.top, bar.h) * VERTICAL_OVERLAP_RATIO) return false
      const maxGap = Math.max(6, cluster.minBarWidth * 6)
      return bar.x - cluster.right <= maxGap
    })
    if (match) {
      match.bars.push(bar)
      match.top = Math.min(match.top, top)
      match.bottom = Math.max(match.bottom, bottom)
      match.right = Math.max(match.right, bar.x + bar.w)
      match.minBarWidth = Math.min(match.minBarWidth, bar.w)
    } else {
      clusters.push({
        bars: [bar],
        left: bar.x,
        right: bar.x + bar.w,
        top,
        bottom,
        minBarWidth: bar.w
      })
    }
  }
  return clusters
    .filter((c) => c.bars.length >= MIN_BARS)
    .map((c) => {
      const bodyTop = median(c.bars.map((b) => b.y))
      const bodyBottom = median(c.bars.map((b) => b.y + b.h))
      return {
        x: c.left,
        y: bodyTop,
        w: c.right - c.left,
        h: Math.max(bodyBottom - bodyTop, 1),
        fullY: c.top,
        fullH: Math.max(c.bottom - c.top, 1),
        bars: c.bars
      }
    })
}

function boxesIntersect (a, b) {
  if (!a || !b) return false
  const ax = Number(a.x) || 0
  const ay = Number(a.y) || 0
  const aw = Number(a.width ?? a.w) || 0
  const ah = Number(a.height ?? a.h) || 0
  const bx = Number(b.x) || 0
  const by = Number(b.y) || 0
  const bw = Number(b.width ?? b.w) || 0
  const bh = Number(b.height ?? b.h) || 0
  if (!(aw > 0 && ah > 0 && bw > 0 && bh > 0)) return false
  return !(ax + aw < bx || bx + bw < ax || ay + ah < by || by + bh < ay)
}

function clusterToBox (cluster) {
  const extra = Math.max(28, (Number(cluster.h) || 0) * 0.15)
  const padX = Math.max(16, (Number(cluster.w) || 0) * 0.08)
  const y = Number(cluster.fullY ?? cluster.y) || 0
  const h = Number(cluster.fullH ?? cluster.h) || 0
  return {
    x: (Number(cluster.x) || 0) - padX,
    y,
    width: Math.max((Number(cluster.w) || 0) + 2 * padX, 1),
    height: Math.max(h + extra, 1)
  }
}

/** Ink only (guards included). Leaves the HRI band on the PDF bitmap. */
function barInkBox (cluster) {
  const padX = Math.max(8, (Number(cluster.w) || 0) * 0.04)
  const y = Number(cluster.fullY ?? cluster.y) || 0
  const bodyBottom = (Number(cluster.y) || 0) + (Number(cluster.h) || 0)
  return {
    x: (Number(cluster.x) || 0) - padX,
    y,
    width: Math.max((Number(cluster.w) || 0) + 2 * padX, 1),
    height: Math.max(bodyBottom - y, 1)
  }
}

function clusterBarsToRuns (cluster) {
  const bars = [...(cluster && cluster.bars || [])]
    .map((b) => ({ x: Number(b.x) || 0, w: Number(b.w) || 0 }))
    .filter((b) => b.w > 0)
    .sort((a, b) => a.x - b.x)
  if (!bars.length) return []
  const merged = []
  for (const bar of bars) {
    const last = merged[merged.length - 1]
    if (last && bar.x <= last.x + last.w + 0.2) {
      last.w = Math.max(last.w, bar.x + bar.w - last.x)
      continue
    }
    merged.push({ x: bar.x, w: bar.w })
  }
  const runs = []
  for (let i = 0; i < merged.length; i++) {
    if (i > 0) {
      const gap = merged[i].x - (merged[i - 1].x + merged[i - 1].w)
      if (gap > 0.05) runs.push(gap)
    }
    runs.push(merged[i].w)
  }
  return runs
}

function tryDecodeRuns (runs) {
  if (!runs.length) return null
  try {
    const rec = decode({ runs })
    const text = String(rec && rec.text || '').trim()
    if (!text) return null
    return { format: rec.format, content: text }
  } catch {
    return null
  }
}

function hriDigitsNear (textLines, pageHeightPt, cluster) {
  const search = {
    x: (Number(cluster.x) || 0) - 48,
    y: (Number(cluster.fullY ?? cluster.y) || 0) - 8,
    width: (Number(cluster.w) || 0) + 96,
    height: (Number(cluster.fullH ?? cluster.h) || 0) + 48
  }
  const hits = []
  for (const t of textLines || []) {
    const text = String(t.content || '').trim()
    if (!text || /[A-Za-z]/.test(text)) continue
    const digits = text.replace(/\D/g, '')
    if (!digits) continue
    const box = {
      x: (Number(t.xPt) || 0) * PDF_CSS_SCALE,
      y: (Number(t.yTopPt) || 0) * PDF_CSS_SCALE,
      width: Math.max((Number(t.wPt) || 0) * PDF_CSS_SCALE, 4),
      height: Math.max((Number(t.hPt) || 0) * PDF_CSS_SCALE, 4)
    }
    if (!boxesIntersect(box, search)) continue
    hits.push({ x: box.x, digits })
  }
  hits.sort((a, b) => a.x - b.x)
  return hits.map((h) => h.digits).join('')
}

function pickCluster (clusters, matchBox) {
  const hint = expandHriMatchBox(matchBox)
  if (hint) {
    const hit = clusters.find((c) => boxesIntersect(clusterToBox(c), hint))
    if (hit) return hit
  }
  if (!clusters.length) return null
  return [...clusters].sort((a, b) => (b.w * b.h) - (a.w * a.h))[0]
}

function clustersOf (pageLayout) {
  const pageH = Number(pageLayout && pageLayout.pageHeightPt) || 0
  const shapes = (pageLayout && pageLayout.paths || []).map((p) => pathToCssShape(p, pageH))
  return findBarcodeClusters(shapes)
}

const SCAN_FORMATS = [undefined, 'upca', 'ean13', 'ean8', 'code128', 'code39', 'interleaved2of5']

/** Crop box for image scan: bar cluster (plus quiet) or the expanded match box. */
export function findPdfBarcodeRegion (pageLayout, matchBox) {
  const cluster = pickCluster(clustersOf(pageLayout), matchBox)
  const hint = expandHriMatchBox(matchBox)
  if (!cluster && !hint) return null
  return {
    cluster,
    inkBox: cluster ? barInkBox(cluster) : hint,
    scanBox: cluster ? clusterToBox(cluster) : hint
  }
}

/** Scan a painted barcode crop. Format and content come from the symbol. */
export function scanBarcodeImage (imageData) {
  if (!imageData || !imageData.width || !imageData.height) return null
  for (const format of SCAN_FORMATS) {
    try {
      const rec = decode(format ? { imageData, format } : { imageData })
      const text = String(rec && rec.text || '').trim()
      if (!text || rec.format === 'qrcode') continue
      return { format: rec.format, content: text, source: 'scan' }
    } catch {
      /* try next symbology */
    }
  }
  return null
}

/** Short wide match box is the HRI strip; grow upward to cover the bars. */
export function expandHriMatchBox (box) {
  const x = Number(box && box.x) || 0
  const y = Number(box && box.y) || 0
  const w = Number(box && box.width) || 0
  const h = Number(box && box.height) || 0
  if (!(w > 0 && h > 0)) return null
  if (h < w * 0.35) {
    const bars = Math.max(h * 4, Math.min(w * 0.55, 220))
    return {
      x,
      y: Math.max(0, y - bars),
      width: w,
      height: bars + h + Math.min(16, h * 0.4)
    }
  }
  return { x, y, width: w, height: h }
}

/** Excel retail column only. PO / match key is not a barcode. */
export function rasterBarcodePayload (row) {
  const field = pickRowField(row, BARCODE_VALUE_FIELDS)
  const rawUpc = field ? String(row[field] ?? '') : ''
  if (!looksRetailUpc(rawUpc)) return null
  const inferred = inferRetailBarcodeFormat(rawUpc, '')
  const packed = coerceBarcodeSymbology(inferred.content, inferred.format)
  return { content: packed.content, format: packed.format }
}

/**
 * Read the linear barcode that is already on the customer PDF.
 * Format and content come from the symbol (and its HRI), not from the match key.
 */
export function detectPdfBarcode (pageLayout, matchBox, scanned) {
  const pageH = Number(pageLayout && pageLayout.pageHeightPt) || 0
  const region = findPdfBarcodeRegion(pageLayout, matchBox)
  const cluster = region && region.cluster
  const hri = cluster ? hriDigitsNear(pageLayout && pageLayout.textLines, pageH, cluster) : ''
  if (scanned && scanned.format && scanned.content) {
    return {
      format: scanned.format,
      content: scanned.content,
      cluster,
      hri,
      source: 'scan'
    }
  }
  if (!cluster) return null
  const decoded = tryDecodeRuns(clusterBarsToRuns(cluster))
  if (decoded) {
    if (looksRetailUpc(hri) && !isUpcFamilyFormat(decoded.format)) {
      const inferred = inferRetailBarcodeFormat(hri, '')
      return { format: inferred.format, content: inferred.content, cluster, hri, source: 'vector' }
    }
    return { format: decoded.format, content: decoded.content, cluster, hri, source: 'vector' }
  }
  if (looksRetailUpc(hri)) {
    const inferred = inferRetailBarcodeFormat(hri, '')
    return { format: inferred.format, content: inferred.content, cluster, hri, source: 'hri' }
  }
  return null
}

/**
 * CSS-px box + payload for the Grade-A replacement, or null if the PDF
 * has no linear barcode to reprint.
 */
export function rasterBarcodeReplace (pageLayout, matchBox, row, scanned) {
  const detected = detectPdfBarcode(pageLayout, matchBox, scanned)
  if (!detected) return null
  let format = detected.format
  let content = detected.content
  const excel = rasterBarcodePayload(row)
  if (excel && isUpcFamilyFormat(detected.format) && isUpcFamilyFormat(excel.format)) {
    content = excel.content
    format = excel.format
  }
  const packed = coerceBarcodeSymbology(content, format)
  const keepHri = packed.content === detected.content || packed.content === detected.hri
  const region = findPdfBarcodeRegion(pageLayout, matchBox)
  const box = detected.cluster
    ? (keepHri ? barInkBox(detected.cluster) : clusterToBox(detected.cluster))
    : (region && region.scanBox)
  if (!box) return null
  return {
    box,
    content: packed.content,
    format: packed.format,
    keepHri,
    element: {
      type: 'barcode',
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      content: packed.content,
      parsedContent: packed.content,
      barcodeFormat: packed.format,
      barcodeDisplayValue: !keepHri,
      barcodeFit: 'element'
    }
  }
}
