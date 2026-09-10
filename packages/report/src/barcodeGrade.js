/**
 * Barcode geometry SSOT (Grade A).
 * - Integer module width in printer dots @ 300 dpi (default X = 4 dots ≈ 0.339 mm)
 * - Quiet zone ≥ symbology minimum
 * - Never crush modules to fit a box; may grow with integer modules when space allows
 * - UPC/EAN may nest HRI between guard bars
 * - Format id is the @niqer/barcode symbology (bwip-style aliases UPC/EAN13/CODE128/…)
 */

import { encode as encodeBarcode } from '@niqer/barcode'
import {
  BARCODE_BWIP_SYMBOLS,
  getBwipSymbolMeta,
  isBwipMatrixBcid,
  isKnownBwipBcid
} from './barcodeBwipCatalog.js'

export {
  BARCODE_BWIP_SYMBOLS,
  getBwipSymbolMeta,
  isBwipMatrixBcid,
  isKnownBwipBcid,
  listBwipSymbols,
  listBwipSymbolGroups,
  parseBwipOptsString
} from './barcodeBwipCatalog.js'

export const BARCODE_PRINT_DPI = 300
/** Fallback when a format id is missing or unknown (general reports). */
export const BARCODE_FORMAT = 'code128'
/** Default for new barcode elements — Target/Walmart tickets are UPC-A. */
export const RETAIL_BARCODE_FORMAT = 'upca'
/** X-dimension in printer dots @ BARCODE_PRINT_DPI (~0.339 mm / ~13.3 mil). */
export const BARCODE_MODULE_DOTS = 4
/** Quiet zone on each side, in modules (GS1/ISO Code128 minimum). */
export const BARCODE_QUIET_MODULES = 10
/** Minimum bar height in millimetres (Code128 Grade A). */
export const BARCODE_MIN_HEIGHT_MM = 13

/**
 * Grade-A 目标模块宽(mm)。A 级看物理尺寸,与打印机 dpi 无关;
 * 各 dpi 下的点数列用 gradeAModuleDots(dpi) 换算。
 */
export const BARCODE_MODULE_MM = BARCODE_MODULE_DOTS * 25.4 / BARCODE_PRINT_DPI

/** 给定打印机 dpi 下,达到 BARCODE_MODULE_MM 所需的整数模块点数(下限). */
export function gradeAModuleDots (dpi = BARCODE_PRINT_DPI) {
  const d = Number(dpi) > 0 ? Number(dpi) : BARCODE_PRINT_DPI
  return Math.max(1, Math.round(BARCODE_MODULE_MM * d / 25.4))
}

/** UPC-A symbol modules (excluding quiet zones). */
export const UPC_A_DATA_MODULES = 95
/** UPC-A recommended quiet zone modules per side. */
export const UPC_A_QUIET_MODULES = 9
/** EAN-13 symbol modules (excluding quiet). */
export const EAN13_DATA_MODULES = 95
/** ISO 15420 / GS1 right quiet (left quiet is 11X, applied via side digits). */
export const EAN13_QUIET_MODULES = 7
/** ISO/IEC 18004 6.3.8 — QR Code quiet zone on all four sides. */
export const QR_QUIET_MODULES = 4
/** In-box quiet (modules). ISO 4X for QR lives on the label around the element. */
export const MATRIX_INBOX_QUIET = 1

export const CSS_DPI = 96
export const MM_PER_INCH = 25.4

export function pxToDots (px, dpi = BARCODE_PRINT_DPI) {
  const n = Number(px)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * dpi / CSS_DPI)
}

export function dotsToPx (dots, dpi = BARCODE_PRINT_DPI) {
  const n = Number(dots)
  if (!Number.isFinite(n)) return 0
  return n * CSS_DPI / dpi
}

export function mmToPx (mm) {
  const n = Number(mm)
  if (!Number.isFinite(n)) return 0
  return n * CSS_DPI / MM_PER_INCH
}

export function mmToDots (mm, dpi = BARCODE_PRINT_DPI) {
  const n = Number(mm)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * dpi / MM_PER_INCH)
}

export function dotsToMm (dots, dpi = BARCODE_PRINT_DPI) {
  const n = Number(dots)
  if (!Number.isFinite(n)) return 0
  return n * MM_PER_INCH / dpi
}

export function pxToMm (px) {
  const n = Number(px)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n * MM_PER_INCH / CSS_DPI
}

export function mmToInch (mm) {
  const n = Number(mm)
  if (!Number.isFinite(n)) return 0
  return n / MM_PER_INCH
}

export function inchToMm (inch) {
  const n = Number(inch)
  if (!Number.isFinite(n)) return 0
  return n * MM_PER_INCH
}

export function roundMm (mm, digits = 2) {
  const n = Number(mm)
  if (!Number.isFinite(n)) return 0
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export function roundInch (inch, digits = 3) {
  const n = Number(inch)
  if (!Number.isFinite(n)) return 0
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** Legacy designer / import aliases → catalog id. */
const LEGACY_FORMAT_TO_BCID = {
  UPC: 'upca',
  UPCA: 'upca',
  UPCE: 'upce',
  EAN: 'ean13',
  EAN13: 'ean13',
  EAN8: 'ean8',
  EAN14: 'ean14',
  SSCC: 'sscc',
  SSCC18: 'sscc',
  UCC128: 'gs1-128',
  EAN128: 'gs1-128',
  UCCEAN128: 'gs1-128',
  ISBN: 'isbn',
  ISMN: 'ismn',
  ISSN: 'issn',
  MSI: 'msi',
  CODE11: 'code11',
  PHARMACODE: 'pharmacode',
  POSTNET: 'postnet',
  INDUSTRIAL2OF5: 'industrial2of5',
  INDUSTRIAL25: 'industrial2of5',
  STRAIGHT2OF5: 'industrial2of5',
  CODE25: 'industrial2of5',
  CODE128: 'code128',
  CODE_128: 'code128',
  GS1128: 'gs1-128',
  CODE39: 'code39',
  CODE_39: 'code39',
  CODE39EXT: 'code39',
  CODE93: 'code93',
  CODE_93: 'code93',
  ITF: 'interleaved2of5',
  I25: 'interleaved2of5',
  INTERLEAVED2OF5: 'interleaved2of5',
  ITF14: 'itf14',
  CODABAR: 'codabar',
  NW7: 'codabar',
  QR: 'qrcode',
  QRCODE: 'qrcode',
  PDF417: 'pdf417',
  PDF_417: 'pdf417',
  DATAMATRIX: 'datamatrix',
  DM: 'datamatrix',
  GS1DATAMATRIX: 'gs1datamatrix',
  AZTEC: 'azteccode',
  AZTECCODE: 'azteccode',
  MAXICODE: 'qrcode'
}

const MATRIX_FALLBACK_RE = /qrcode|datamatrix|pdf417|aztec|maxicode|hanxin|dotcode|ultracode|swissqr|microqr/i

/**
 * Normalize designer / import format → catalog id.
 * Accepts raw ids (`upca`, `code128`) and legacy names (`UPC`, `CODE128`).
 * Unknown linear ids fall back to Code 128; leftover matrix ids become QR.
 */
export function resolveBarcodeFormat (element = {}) {
  const raw = element?.barcodeFormat ?? element?.format ?? BARCODE_FORMAT
  const s = String(raw || BARCODE_FORMAT).trim()
  if (!s) return BARCODE_FORMAT
  const lower = s.toLowerCase()
  if (isKnownBwipBcid(lower)) return lower
  const compact = s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (LEGACY_FORMAT_TO_BCID[compact]) return LEGACY_FORMAT_TO_BCID[compact]
  if (MATRIX_FALLBACK_RE.test(lower)) return 'qrcode'
  return BARCODE_FORMAT
}

/** Catalog ids for designer dropdowns. */
export const BARCODE_FORMAT_OPTIONS = BARCODE_BWIP_SYMBOLS.map((s) => s.bcid)

/**
 * Map internal format → catalog id. Identity after resolve.
 */
export function resolveBwipBcid (formatOrElement) {
  return typeof formatOrElement === 'string'
    ? resolveBarcodeFormat({ barcodeFormat: formatOrElement })
    : resolveBarcodeFormat(formatOrElement || {})
}

/**
 * Retail UPC/EAN from payload length. Used on PDF import when ZXing reports
 * Code128/Code39 for a UPC-A label (12 digits, or EAN-13 with a leading 0).
 * Does not override an explicit non-retail format chosen in the designer.
 */
export function inferRetailBarcodeFormat (content, reportedFormat) {
  const reported = resolveBarcodeFormat({ barcodeFormat: reportedFormat || BARCODE_FORMAT })
  const raw = String(content ?? '')
  const digits = raw.replace(/\D/g, '')
  if (reported === 'upce' && digits.length >= 6 && digits.length <= 8) {
    return { format: 'upce', content: digits }
  }
  if (reported === 'ean8' && (digits.length === 7 || digits.length === 8)) {
    return { format: 'ean8', content: digits }
  }
  if (reported === 'ean13' && digits.length === 13 && !digits.startsWith('0')) {
    return { format: 'ean13', content: digits }
  }
  if (digits.length === 13 && digits.startsWith('0')) {
    return { format: 'upca', content: digits.slice(1) }
  }
  if (digits.length === 12 || digits.length === 11) {
    return { format: 'upca', content: digits }
  }
  if (reported === 'ean13' && digits.length === 13) {
    return { format: 'ean13', content: digits }
  }
  return { format: reported, content: raw }
}

/**
 * Scanners often report UPC-A as EAN-13 with a leading 0 (or as 12-digit EAN13).
 * Coerce to `upca` + 12 digits so encode draws the correct symbol.
 */
export function coerceBarcodeSymbology (content, format) {
  const f0 = resolveBarcodeFormat({ barcodeFormat: format || BARCODE_FORMAT })
  const raw = String(content ?? '')
  const digits = raw.replace(/\D/g, '')
  if (f0 === 'upce' && digits.length >= 6 && digits.length <= 8) {
    return { format: 'upce', content: digits }
  }
  if (digits.length === 13 && digits.startsWith('0') && (f0 === 'ean13' || f0 === 'upca')) {
    return { format: 'upca', content: digits.slice(1) }
  }
  if (f0 === 'ean13' && digits.length === 12) {
    return { format: 'upca', content: digits }
  }
  if (f0 === 'upca' && (digits.length === 11 || digits.length === 12)) {
    return { format: 'upca', content: digits }
  }
  if (f0 === 'ean13' && digits.length === 13) {
    return { format: 'ean13', content: digits }
  }
  if (f0 === 'ean8' && digits.length >= 7) {
    return { format: 'ean8', content: digits }
  }
  if (f0 === 'upca' || f0 === 'upce' || f0 === 'ean13' || f0 === 'ean8') {
    return { format: f0, content: digits || raw }
  }
  return { format: f0, content: raw }
}

/** UPC/EAN retail family — HRI nests between guard bars. */
export function isUpcFamilyFormat (formatOrElement) {
  const f = resolveBwipBcid(formatOrElement)
  return f === 'upca' || f === 'upce' || f === 'ean13' || f === 'ean8' ||
    f === 'ean5' || f === 'ean2' || f === 'isbn' || f === 'ismn' || f === 'issn'
}

function retailPayloadLooksValid (format, content) {
  const digits = String(content ?? '').replace(/\D/g, '')
  if (format === 'upca') {
    return digits.length === 11 || digits.length === 12 || (digits.length === 13 && digits.startsWith('0'))
  }
  if (format === 'ean13' || format === 'isbn' || format === 'ismn') {
    const compact = String(content ?? '').replace(/[-\s]/g, '')
    return digits.length === 12 || digits.length === 13 || /^\d{9}[\dXx]$/i.test(compact) ||
      (format === 'ismn' && /^M\d{9}$/i.test(compact))
  }
  if (format === 'issn') {
    const compact = String(content ?? '').replace(/[-\s]/g, '')
    return digits.length === 12 || digits.length === 13 || /^\d{7}[\dXx]$/i.test(compact)
  }
  if (format === 'ean8') return digits.length === 7 || digits.length === 8
  if (format === 'upce') return digits.length >= 6 && digits.length <= 8
  if (format === 'itf14' || format === 'ean14') return digits.length === 13 || digits.length === 14
  if (format === 'sscc') return digits.length === 17 || digits.length === 18 || digits.length === 20
  return false
}

/**
 * Encode without silently turning UPC/EAN into Code 128.
 * Invalid retail payloads return null so the caller can show a blank/sample.
 */
export function encodeBarcodeSymbol (text, format, eccLevel) {
  const payload = String(text ?? '')
  if (!payload.trim()) return null
  const resolved = resolveBarcodeFormat({ barcodeFormat: format })
  try {
    return encodeBarcode(payload, { format: resolved, eccLevel: eccLevel || 'M' })
  } catch {
    if (isUpcFamilyFormat(resolved) || resolved === 'itf14' || resolved === 'ean14' || resolved === 'sscc') return null
    if (isBwipMatrixBcid(resolved)) {
      try {
        return encodeBarcode(payload, { format: 'qrcode', eccLevel: eccLevel || 'M' })
      } catch { /* fall through */ }
    }
    try {
      return encodeBarcode(payload, { format: 'code128' })
    } catch {
      return null
    }
  }
}

/** Designer canvas: keep UPC-A geometry visible when the bound field is empty. */
export function designerBarcodeSample (content, element) {
  const format = resolveBarcodeFormat(element)
  const raw = String(content ?? '').trim()
  if (retailPayloadLooksValid(format, raw)) return raw
  if (isUpcFamilyFormat(format) || format === 'itf14' || format === 'ean14' || format === 'sscc') {
    return getBwipSymbolMeta(format)?.sample || '191908755830'
  }
  return raw
}

/** Classic nested HRI (bwip includetext) — requires an explicit opt-in flag. */
export function barcodeWantsDisplayValue (element = {}) {
  return element?.barcodeDisplayValue === true || element?.displayValue === true
}

/**
 * Extra blank modules reserved when HRI draws side digits outside the bar
 * pattern (ISO 15420 / GS1: UPC-A Illustrator 8+8, EAN-13 11+0 with 7X right
 * quiet, UPC-E 9+7).
 */
export function upcDisplaySideModules (format, displayValue = true) {
  if (!displayValue) return { left: 0, right: 0 }
  const f = resolveBwipBcid(format)
  if (f === 'upca') return { left: 8, right: 8 }
  if (f === 'upce') return { left: 9, right: 7 }
  if (f === 'ean13' || f === 'isbn' || f === 'ismn' || f === 'issn') return { left: 11, right: 0 }
  return { left: 0, right: 0 }
}

/** Minimum integer CSS px per module that still maps to Grade-A X @ print dpi. */
export function gradeAModuleCssPx (dpi = BARCODE_PRINT_DPI) {
  const floorDots = gradeAModuleDots(dpi)
  return Math.max(1, Math.ceil(floorDots * CSS_DPI / dpi))
}

/**
 * Largest integer CSS module width that fits `elW`, never below Grade-A floor.
 * If the box is too narrow, return the floor (symbol may overflow — Grade A wins).
 */
export function fitGradeAModuleCssPx (elW, totalModules, dpi = BARCODE_PRINT_DPI) {
  const floorPx = gradeAModuleCssPx(dpi)
  const modules = Math.max(1, Number(totalModules) || 1)
  const width = Number(elW)
  if (!(width > 0)) return floorPx
  const fitted = Math.floor(width / modules)
  return Math.max(floorPx, fitted)
}

/** Integer-only scale for placing barcode bitmaps (fractional scale kills Grade A). */
export function barcodePlaceScale (natW, natH, innerW, innerH) {
  if (!(natW > 0) || !(natH > 0) || !(innerW > 0) || !(innerH > 0)) return 1
  const raw = Math.min(innerW / natW, innerH / natH)
  if (raw < 1) return 1
  return Math.max(1, Math.floor(raw + 1e-9))
}

export function estimateCode128Modules (content, opts = {}) {
  const s = String(content ?? '')
  if (!s) return 11 + 11 + 11 + 13
  try {
    const packed = encodeBarcode(s, { format: opts.gs1 ? 'gs1-128' : 'code128' })
    if (packed?.kind === 'linear' && packed.modules?.length) return packed.modules.length
  } catch {
    /* invalid payload — fall through */
  }
  if (/^\d+$/.test(s) && s.length >= 2 && s.length % 2 === 0) {
    return 11 + 11 * (s.length / 2) + 11 + 13
  }
  if (/^\d+$/.test(s) && s.length >= 4) {
    const pairs = Math.floor(s.length / 2)
    return 11 + 11 * pairs + 11 + 11 + 11 + 13
  }
  const n = s.length
  return 11 + 11 * n + 11 + 13
}

function formatModuleCounts (format, content) {
  const f = resolveBwipBcid(format)
  if (f === 'upca') {
    return { dataModules: UPC_A_DATA_MODULES, quietModules: 0 }
  }
  if (f === 'upce') {
    return { dataModules: 51, quietModules: 0 }
  }
  if (f === 'ean13' || f === 'isbn' || f === 'ismn' || f === 'issn') {
    return { dataModules: EAN13_DATA_MODULES, quietModules: 0 }
  }
  if (f === 'ean8') {
    return { dataModules: 67, quietModules: 0 }
  }
  if (f === 'code39' || f === 'code39ext' || f === 'hibccode39') {
    const n = Math.max(1, String(content ?? '').length)
    return { dataModules: 13 + n * 16 + 13, quietModules: 0 }
  }
  if (f === 'code93') {
    const n = Math.max(1, String(content ?? '').length)
    return { dataModules: 9 + n * 9 + 9 + 9 + 9 + 1, quietModules: 0 }
  }
  if (f === 'codabar') {
    const n = Math.max(2, String(content ?? '').length)
    return { dataModules: n * 8 - 1, quietModules: 0 }
  }
  if (f === 'interleaved2of5' || f === 'itf14' || f === 'ean14') {
    const n = Math.max(2, String(content ?? '').replace(/\D/g, '').length)
    const pairs = Math.ceil(n / 2)
    return { dataModules: 9 + pairs * 18 + 8, quietModules: 0 }
  }
  if (f === 'industrial2of5') {
    const n = Math.max(2, String(content ?? '').replace(/\D/g, '').length)
    return { dataModules: 10 + n * 12 + 10, quietModules: 0 }
  }
  if (f === 'msi') {
    const n = Math.max(1, String(content ?? '').replace(/\D/g, '').length)
    return { dataModules: 3 + 12 * (n + 1) + 4, quietModules: 0 }
  }
  if (f === 'code11') {
    const n = Math.max(1, String(content ?? '').replace(/[^0-9-]/g, '').length)
    return { dataModules: 8 + (n + 2) * 7, quietModules: 0 }
  }
  if (f === 'pharmacode') {
    return { dataModules: 48, quietModules: 0 }
  }
  if (f === 'postnet') {
    const n = Math.max(5, String(content ?? '').replace(/\D/g, '').length)
    return { dataModules: (1 + 5 * (n + 1) + 1) * 2 - 1, quietModules: 0 }
  }
  if (f === 'gs1-128' || f === 'sscc') {
    return {
      dataModules: estimateCode128Modules(content, { gs1: true }),
      quietModules: 0
    }
  }
  if (isBwipMatrixBcid(f)) {
    return { dataModules: 40, quietModules: matrixInboxQuiet(f) }
  }
  return {
    dataModules: estimateCode128Modules(content),
    quietModules: 0
  }
}

/** Quiet modules drawn inside the element box (not ISO paper quiet). */
export function matrixInboxQuiet (format) {
  const f = resolveBarcodeFormat({ barcodeFormat: format })
  if (f === 'pdf417') return 2
  if (f === 'azteccode') return 0
  if (f === 'datamatrix' || f === 'gs1datamatrix') return 1
  return MATRIX_INBOX_QUIET
}

/**
 * Fit a matrix symbol into a box. Uses a (possibly fractional) module so the
 * glyph + inbox quiet fill the square/rectangle instead of leaving a grey frame.
 */
export function matrixFitGeometry (symbol, boxW, boxH, format) {
  const nW = Math.max(1, Number(symbol?.width) || 1)
  const nH = Math.max(1, Number(symbol?.height) || nW)
  const q = matrixInboxQuiet(format || symbol?.format)
  const totalW = nW + 2 * q
  const totalH = nH + 2 * q
  const w = Math.max(1, Number(boxW) || 1)
  const h = Math.max(1, Number(boxH) || 1)
  const module = Math.max(0.25, Math.min(w / totalW, h / totalH))
  const usedW = module * totalW
  const usedH = module * totalH
  return {
    module,
    offsetX: (w - usedW) / 2 + q * module,
    offsetY: (h - usedH) / 2 + q * module,
    usedW,
    usedH,
    quiet: q
  }
}

/**
 * Quiet modules outside the encoded symbol (@niqer/barcode, not JsBarcode).
 * Side-digit columns already consume part of the UPC/EAN quiet zone when HRI is on.
 */
function quietMargins (format, displayValue, requestedQuiet) {
  const side = upcDisplaySideModules(format, displayValue)
  const q = Math.max(0, Number(requestedQuiet) || 0)
  return {
    left: Math.max(0, q - side.left),
    right: Math.max(0, q - side.right),
    side
  }
}

/**
 * Screen / PDF layout geometry in CSS px (96dpi).
 * In-house Grade-A module math; does not call JsBarcode.
 * All symbologies: Grade-A module floor; optional integer grow to fill element.
 */
export function barcodeJsBarcodeOptions (content, element = {}, opts = {}) {
  const dpi = Number(opts.dpi) > 0 ? Number(opts.dpi) : BARCODE_PRINT_DPI
  const format = resolveBarcodeFormat(element)
  const counts = formatModuleCounts(format, content)
  const displayValue = barcodeWantsDisplayValue(element)
  const textMargin = Number.isFinite(Number(element?.barcodeTextMargin))
    ? Math.max(0, Number(element.barcodeTextMargin))
    : 2
  let fontSize = Number(element?.barcodeFontSize) > 0
    ? Number(element.barcodeFontSize)
    : (displayValue ? 20 : 0)

  const elW = Number(element.width) > 0 ? Number(element.width) : 0
  const elH = Number(element.height) > 0 ? Number(element.height) : 0

  // Grow integer modules inside the box when asked; never below Grade-A floor.
  const growInBox = element?.barcodeFit === 'element' || (isUpcFamilyFormat(format) && elW > 0)

  const quietFromElement = Number(element?.barcodeQuietModules)
  let quietModules = Number.isFinite(Number(opts.quietModules))
    ? Math.max(0, Number(opts.quietModules))
    : Number.isFinite(quietFromElement)
      ? Math.max(0, quietFromElement)
      : counts.quietModules

  const margins = quietMargins(format, displayValue, quietModules)
  const encodeModules = counts.dataModules + margins.side.left + margins.side.right
  const totalModules = encodeModules + margins.left + margins.right

  // Layout module pitch (CSS px):
  // - PDF import may pin exact original bar pitch (can be fractional) so symbol
  //   width matches the label; Grade A is enforced at print via integer moduleDots.
  // - Otherwise grow/floor with integer CSS modules (sharp 96dpi preview).
  const floorCss = gradeAModuleCssPx(dpi)
  const pinnedModule = Number(element?.barcodeModuleCssPx)
  const hasPin = Number.isFinite(pinnedModule) && pinnedModule > 0
  let moduleCssPx
  if (hasPin) {
    // Import-pinned Illustrator X — do not snap up to the Grade-A CSS floor.
    moduleCssPx = pinnedModule
  } else if (growInBox) {
    moduleCssPx = fitGradeAModuleCssPx(elW, totalModules, dpi)
  } else {
    moduleCssPx = floorCss
  }
  if (Number(opts.moduleDots) > 0 && !hasPin && !growInBox) {
    moduleCssPx = Math.max(moduleCssPx, Number(opts.moduleDots) * CSS_DPI / dpi)
  }
  if (!hasPin) {
    moduleCssPx = Math.max(floorCss, Math.ceil(moduleCssPx - 1e-9))
  }
  const quietLeftCssPx = margins.left * moduleCssPx
  const quietRightCssPx = margins.right * moduleCssPx
  const quietCssPx = Math.max(quietLeftCssPx, quietRightCssPx)

  if (displayValue) fontSize = Math.min(Math.max(8, fontSize), moduleCssPx * 10)

  // JsBarcode places HRI baseline at height+textMargin+fontSize; glyph descent
  // hangs below that line. Without marginBottom the bottom of digits is clipped.
  const marginBottom = displayValue
    ? (Number.isFinite(Number(element?.barcodeMarginBottom))
      ? Math.max(0, Number(element.barcodeMarginBottom))
      : Math.max(3, Math.ceil(fontSize * 0.3)))
    : 0

  const minBarCssPx = Math.max(1, Math.round(mmToPx(BARCODE_MIN_HEIGHT_MM)))
  const pinnedBarH = Number(element?.barcodeBarHeight)
  const hasPinnedBarH = Number.isFinite(pinnedBarH) && pinnedBarH > 0
  let barHeightCssPx
  let canvasHeight
  if (hasPinnedBarH) {
    barHeightCssPx = pinnedBarH
    canvasHeight = displayValue
      ? barHeightCssPx + fontSize + textMargin + marginBottom
      : barHeightCssPx
  } else if (displayValue) {
    // Matches JsBarcode getEncodingHeight: height + fontSize + textMargin + margins.
    const band = fontSize + textMargin + marginBottom
    if (elH > band + minBarCssPx) {
      barHeightCssPx = Math.max(minBarCssPx, Math.round(elH - band))
    } else {
      barHeightCssPx = minBarCssPx
    }
    canvasHeight = barHeightCssPx + band
  } else if (elH > 0 && growInBox) {
    barHeightCssPx = Math.max(minBarCssPx, Math.round(elH))
    canvasHeight = barHeightCssPx
  } else {
    barHeightCssPx = minBarCssPx
    canvasHeight = barHeightCssPx
  }

  const canvasWidth = encodeModules * moduleCssPx + quietLeftCssPx + quietRightCssPx
  const moduleDots = Math.max(1, Math.round(moduleCssPx * dpi / CSS_DPI))

  const geom = barcodeGeometry({
    content,
    element,
    dpi,
    moduleDots,
    quietModules,
    format
  })

  return {
    format,
    width: moduleCssPx,
    height: barHeightCssPx,
    displayValue,
    fontSize: displayValue ? fontSize : undefined,
    textMargin: displayValue ? textMargin : undefined,
    font: displayValue ? (element?.barcodeFont || 'Arial') : undefined,
    flat: false,
    margin: quietCssPx,
    marginTop: 0,
    marginBottom,
    marginLeft: quietLeftCssPx,
    marginRight: quietRightCssPx,
    lineColor: (element.style && element.style.color) || '#000000',
    background: '#ffffff',
    geometry: geom,
    moduleCssPx,
    quietCssPx,
    canvasWidth,
    canvasHeight,
    gradeA: geom.gradeA === true
  }
}

/**
 * CSS→print bitmap scale. 96dpi canvas looks soft in PDF/print; render at
 * BARCODE_PRINT_DPI so HRI glyphs and module edges stay sharp when placed.
 */
export function barcodeBitmapScale (dpi = BARCODE_PRINT_DPI) {
  const d = Number(dpi) > 0 ? Number(dpi) : BARCODE_PRINT_DPI
  return Math.max(1, Math.round(d / CSS_DPI))
}

/**
 * @deprecated Use barcodeBwipDrawOptions — kept for tests / transitional callers.
 */
export function barcodeJsBarcodeDrawOptions (content, element = {}, opts = {}) {
  return barcodeBwipDrawOptions(content, element, opts)
}

/**
 * Paint geometry at print-dpi bitmap resolution, plus CSS layout size.
 * Place the PNG into layoutWidth×layoutHeight (CSS px); do not treat pixel
 * dimensions as layout size or the symbol will be oversized.
 *
 * Callers encode with @niqer/barcode and paint via paintToContext using
 * modulePx / barHeightPx / offsetX / offsetY. HRI is drawn as vector text.
 */
export function barcodeBwipDrawOptions (content, element = {}, opts = {}) {
  const coerced = coerceBarcodeSymbology(content, resolveBarcodeFormat(element))
  const el = { ...element, barcodeFormat: coerced.format }
  const opt = barcodeJsBarcodeOptions(coerced.content, el, opts)
  const ss = Number(opts.bitmapScale) > 0
    ? Math.max(1, Math.round(Number(opts.bitmapScale)))
    : barcodeBitmapScale(opts.dpi || BARCODE_PRINT_DPI)
  const m = Math.max(1e-6, Number(opt.moduleCssPx) || 1)
  const modulePx = Math.max(
    1,
    Number(opt.geometry?.moduleDots) > 0
      ? Math.round(Number(opt.geometry.moduleDots))
      : Math.max(1, Math.round(Number(opt.width) * ss))
  )
  const cssToDots = modulePx / m
  const padLeft = Math.max(0, Math.round((Number(opt.marginLeft) || 0) / m))
  const drawDisplay = opt.displayValue
  const matrix = isBwipMatrixBcid(coerced.format)
  const barcolor = String(opt.lineColor || '#000000').replace(/^#/, '').toUpperCase()
  const hex = /^[0-9A-F]{6}([0-9A-F]{2})?$/.test(barcolor) ? barcolor : '000000'
  const barHeightPx = Math.max(
    1,
    Number(opt.geometry?.barHeightDots) > 0
      ? Math.round(Number(opt.geometry.barHeightDots))
      : Math.round(Number(opt.height) * ss)
  )
  const offsetX = padLeft * modulePx
  const offsetY = Math.max(0, Math.round((Number(opt.marginTop) || 0) * cssToDots))
  const pixelWidth = Math.max(
    1,
    Number(opt.geometry?.symbolWidthDots) > 0
      ? Math.round(Number(opt.geometry.symbolWidthDots))
      : Math.round(Number(opt.canvasWidth) * ss)
  )
  const pixelHeight = matrix
    ? pixelWidth
    : Math.max(barHeightPx + offsetY, Math.round(Number(opt.canvasHeight) * cssToDots))

  return {
    ...opt,
    content: coerced.content,
    format: coerced.format,
    bitmapScale: ss,
    layoutWidth: matrix
      ? Math.max(10, Number(element.width) || opt.canvasWidth)
      : opt.canvasWidth,
    layoutHeight: matrix
      ? Math.max(10, Number(element.height) || opt.canvasHeight)
      : opt.canvasHeight,
    barsLayoutWidth: opt.canvasWidth,
    barsLayoutHeight: opt.canvasHeight,
    hriClearTopCss: (!matrix && drawDisplay)
      ? ((opt.marginTop || 0) + opt.height + Math.max(0, (opt.textMargin || 0) * 0.25))
      : null,
    modulePx,
    barHeightPx,
    offsetX,
    offsetY,
    pixelWidth,
    pixelHeight,
    color: `#${hex}`
  }
}

/**
 * HRI glyph boxes in CSS px relative to the symbol top-left (incl. left quiet).
 * Matches JsBarcode UPC/EAN guarded layout so PDF vector text nests in guards.
 */
export function barcodeHriLayout (content, element = {}, opts = {}) {
  const coerced = coerceBarcodeSymbology(content, resolveBarcodeFormat(element))
  const el = { ...element, barcodeFormat: coerced.format }
  const opt = barcodeJsBarcodeOptions(coerced.content, el, opts)
  if (!opt.displayValue) return { opt, glyphs: [] }
  const format = opt.format
  const digits = String(coerced.content || '').replace(/\D/g, '')
  const m = opt.moduleCssPx
  const fontSize = opt.fontSize || 12
  // JsBarcode fillText baseline: height + textMargin + marginTop + fontSize
  const baseline = (opt.marginTop || 0) + opt.height + (opt.textMargin || 0) + fontSize
  const glyphs = []

  if ((format === 'upca' || format === 'ean13') && digits.length >= (format === 'upca' ? 12 : 13)) {
    const n = format === 'upca' ? 12 : 13
    const d = digits.slice(0, n)
    // UPC-A guarded segments (modules): 8 | 10 | 35 | 5 | 35 | 10 | 8
    // EAN-13: 12 side-left | 3+6*7 | 5 | 6*7 | 3 | (side right absorbed differently)
    if (format === 'upca') {
      let x = opt.marginLeft || 0
      const leftSide = 8 * m
      const leftGuard = 10 * m
      const cell = 7 * m
      const mid = 5 * m
      const rightGuard = 10 * m
      const rightSide = 8 * m
      const sideFont = Math.round(fontSize * 0.86 * 10) / 10
      glyphs.push({ text: d[0], x, width: leftSide, align: 'center', baseline, fontSize: sideFont })
      x += leftSide + leftGuard
      for (let i = 0; i < 5; i++) {
        glyphs.push({ text: d[1 + i], x: x + i * cell, width: cell, align: 'center', baseline, fontSize })
      }
      x += 5 * cell + mid
      for (let i = 0; i < 5; i++) {
        glyphs.push({ text: d[6 + i], x: x + i * cell, width: cell, align: 'center', baseline, fontSize })
      }
      x += 5 * cell + rightGuard
      glyphs.push({ text: d[11], x, width: rightSide, align: 'center', baseline, fontSize: sideFont })
    } else {
      // EAN-13 ISO 15420: 11X left quiet for the first digit, then 6+6 data.
      let x = opt.marginLeft || 0
      const leftSide = 11 * m
      const leftGuard = 3 * m
      const cell = 7 * m
      const mid = 5 * m
      const sideFont = Math.round(fontSize * 0.86 * 10) / 10
      glyphs.push({ text: d[0], x, width: leftSide, align: 'center', baseline, fontSize: sideFont })
      x += leftSide + leftGuard
      for (let i = 0; i < 6; i++) {
        glyphs.push({ text: d[1 + i], x: x + i * cell, width: cell, align: 'center', baseline, fontSize })
      }
      x += 6 * cell + mid
      for (let i = 0; i < 6; i++) {
        glyphs.push({ text: d[7 + i], x: x + i * cell, width: cell, align: 'center', baseline, fontSize })
      }
    }
    return { opt, glyphs }
  }

  // Non-UPC family fallback: one centered run under the bars.
  const text = String(content || '')
  glyphs.push({
    text,
    x: opt.marginLeft || 0,
    width: Math.max(0, opt.canvasWidth - (opt.marginLeft || 0) - (opt.marginRight || 0)),
    align: 'center',
    baseline,
    fontSize
  })
  return { opt, glyphs }
}

/**
 * Print / ZPL geometry in dots.
 */
export function barcodeGeometry ({
  content,
  element = {},
  dpi = BARCODE_PRINT_DPI,
  moduleDots,
  quietModules,
  format
} = {}) {
  const resolvedFormat = format || resolveBarcodeFormat(element)
  const counts = formatModuleCounts(resolvedFormat, content)
  const displayValue = barcodeWantsDisplayValue(element)
  const qModules = Number.isFinite(Number(quietModules))
    ? Math.max(0, Number(quietModules))
    : counts.quietModules

  const elW = Number(element.width) > 0 ? Number(element.width) : 0
  const elH = Number(element.height) > 0 ? Number(element.height) : 0
  const elWDots = elW > 0 ? pxToDots(elW, dpi) : 0
  const elHDots = elH > 0 ? pxToDots(elH, dpi) : 0

  const margins = quietMargins(resolvedFormat, displayValue, qModules)
  const encodeModules = counts.dataModules + margins.side.left + margins.side.right
  const totalModules = encodeModules + margins.left + margins.right

  // 模块下限按目标毫米换算到当前 dpi(203→3dots, 300→4dots),禁止写死「永远 ≥4 点」。
  const floorDots = gradeAModuleDots(dpi)
  const growInBox = element?.barcodeFit === 'element' || (isUpcFamilyFormat(resolvedFormat) && elWDots > 0)
  let modDots
  if (Number(moduleDots) > 0) {
    // Caller already chose X (e.g. from barcodeJsBarcodeOptions) — do not re-fit larger.
    modDots = Math.max(floorDots, Number(moduleDots))
  } else if (growInBox && elWDots > 0) {
    const fitted = Math.floor(elWDots / Math.max(1, totalModules))
    modDots = Math.max(floorDots, fitted)
  } else {
    modDots = floorDots
  }

  const quietDots = (margins.left + margins.right) * modDots
  const symbolModules = totalModules
  const symbolWidthDots = symbolModules * modDots

  const minHDots = mmToDots(BARCODE_MIN_HEIGHT_MM, dpi)
  let barHeightDots
  if (elHDots > 0 && (growInBox || displayValue)) {
    if (displayValue) {
      const fontDots = Math.max(1, pxToDots(Number(element.barcodeFontSize) || 20, dpi))
      const textMarginDots = Math.max(0, pxToDots(Number(element.barcodeTextMargin) || 2, dpi))
      barHeightDots = Math.max(minHDots, elHDots - fontDots - textMarginDots)
    } else {
      barHeightDots = Math.max(minHDots, elHDots)
    }
  } else {
    barHeightDots = minHDots
  }

  const elementWidthDots = elWDots > 0 ? elWDots : symbolWidthDots
  const elementHeightDots = elHDots > 0 ? elHDots : barHeightDots
  const fits = elementWidthDots >= symbolWidthDots && elementHeightDots >= minHDots
  const moduleMm = dotsToMm(modDots, dpi)

  return {
    format: resolvedFormat,
    dpi,
    moduleDots: modDots,
    moduleMm,
    quietModules: margins.left + margins.right,
    quietDots,
    dataModules: counts.dataModules,
    symbolModules,
    symbolWidthDots,
    barHeightDots,
    elementWidthDots,
    elementHeightDots,
    fits,
    // A 级:模块物理宽 ≥ 目标 mm(允许 1% 取整误差),且条高 ≥ 最小 mm。
    gradeA: moduleMm + 1e-6 >= BARCODE_MODULE_MM * 0.99 && barHeightDots >= minHDots
  }
}

/** Suggested designer default barcode box (CSS px) for a short Code128 sample. */
export function defaultBarcodeElementSize (sampleContent = '12345678', element = {}) {
  const format = resolveBarcodeFormat(element)
  const opt = barcodeJsBarcodeOptions(sampleContent, {
    ...element,
    barcodeFormat: format,
    height: mmToPx(BARCODE_MIN_HEIGHT_MM)
  })
  return {
    width: Math.ceil(opt.canvasWidth) + 6,
    height: Math.ceil(opt.canvasHeight) + 6
  }
}

/**
 * Keep Illustrator X when the payload changes: width = new module count × pinned X.
 * Height / bar height stay. Mutates `element.width`.
 */
export function syncBarcodeBoxToPinnedX (element, content) {
  if (!element || element.type === 'qrcode') return element
  // UPC/EAN boxes include quiet-zone side digits; encodeModules×X would clip the check digit.
  if (isUpcFamilyFormat(resolveBarcodeFormat(element))) return element
  const pinned = Number(element.barcodeModuleCssPx)
  if (!(pinned > 0)) return element
  const text = content != null ? content : element.content
  if (text == null || !String(text).length) return element
  const opt = barcodeJsBarcodeOptions(text, element)
  const w = Number(opt.canvasWidth)
  if (w > 0) element.width = Math.round(w * 100) / 100
  return element
}

export {
  ADOBE_UPC_DESCENT_EM,
  ADOBE_UPC_SHORT_RATIO,
  ADOBE_UPC_SIDE_FONT_RATIO,
  ADOBE_UPC_SIDE_MODULES,
  ADOBE_UPC_TOTAL_MODULES,
  adobeRetailQuietModules,
  adobeUpcSvg,
  encodeUpcABits,
  ISO_GUARD_EXTENSION_MODULES,
  layoutAdobeUpc,
  normalizeUpcADigits,
  resolveAdobeRetailFormat,
  upcACheckDigit,
  wantsAdobeUpc
} from './upcAdobe.js'
