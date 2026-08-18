/**
 * Adobe Illustrator-style retail barcode: vector bars + Arial HRI in the
 * guard notch.
 *
 * Adobe does not publish a separate barcode geometry spec. Illustrator /
 * Acrobat barcode tools follow ISO/IEC 15420 and the GS1 General
 * Specifications. UPC-A numbers below are measured from Illustrator 29.4
 * export TG-211 0485.pdf (8-module side columns instead of ISO 9X).
 *
 * ISO/IEC 15420:
 * - Guard bars (and UPC-A first/last symbol characters) extend 5X below
 *   the data bars (4.3.3).
 * - Quiet zones (4.3.4 / GS1): UPC-A 9X/9X, EAN-13 11X/7X, EAN-8 7X/7X,
 *   UPC-E 9X/7X. HRI sits in the notch; side digits live in the quiet zone.
 *
 * Keep this file free of barcodeGrade.js imports (barcodeGrade re-exports us).
 */

/** Left-odd (L) encodings, 7 modules, 1 = bar. */
const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011'
]

const R = L.map((s) => s.replace(/0/g, 'x').replace(/1/g, '0').replace(/x/g, '1'))
const G = L.map((s) => s.split('').reverse().join(''))

const START = '101'
const CENTER = '01010'
const END = '101'
const UPCE_END = '010101'

const EAN13_PARITY = [
  'AAAAAA',
  'AABABB',
  'AABBAB',
  'AABBBA',
  'ABAABB',
  'ABBAAB',
  'ABBBAA',
  'ABABAB',
  'ABABBA',
  'ABBABA'
]

const UPCE_PARITY0 = [
  'BBBAAA',
  'BBABAA',
  'BBAABA',
  'BBAAAB',
  'BABBAA',
  'BAABBA',
  'BAAABB',
  'BABABA',
  'BABAAB',
  'BAABAB'
]

const UPC_A_DATA_MODULES = 95
/** Grade-A CSS floor (4 dots @ 300dpi → ceil(1.28) = 2). */
const MODULE_FLOOR_CSS = 2

/** Short bars / guard bars (Illustrator TG-211). */
export const ADOBE_UPC_SHORT_RATIO = 153.9 / 165.83
/** Side digit size / middle digit size. */
export const ADOBE_UPC_SIDE_FONT_RATIO = 10.81 / 12.53
/** Arial-like descender / em, so HRI bottoms are not clipped. */
export const ADOBE_UPC_DESCENT_EM = 0.212
/** Extra px under HRI so hinting / PDFKit descent is not clipped. */
const HRI_CLIP_PAD_PX = 1.5
/** Middle HRI baseline below short-bar bottom, as a fraction of short-bar height (Illustrator 15.05/153.9pt). */
export const ADOBE_UPC_MIDDLE_BASELINE_SHORT = (213.56 - 198.51) / 153.9
/** Side HRI baseline below short-bar bottom (Illustrator 16.84/153.9pt). */
export const ADOBE_UPC_SIDE_BASELINE_SHORT = (215.35 - 198.51) / 153.9
/** @deprecated font-relative; kept so older measurements stay documented. */
export const ADOBE_UPC_MIDDLE_BASELINE_EM = (213.56 - 198.51) / 12.53
export const ADOBE_UPC_SIDE_BASELINE_EM = (215.35 - 198.51) / 10.81
/** Quiet/side-digit columns each side (Illustrator UPC-A; ISO is 9X). */
export const ADOBE_UPC_SIDE_MODULES = 8
export const ADOBE_UPC_TOTAL_MODULES = ADOBE_UPC_SIDE_MODULES * 2 + UPC_A_DATA_MODULES
/** ISO/IEC 15420 4.3.3 — guard (and UPC-A first/last) bars extend this many X below data bars. */
export const ISO_GUARD_EXTENSION_MODULES = 5

const RETAIL = {
  upca: {
    dataModules: 95,
    leftQuiet: ADOBE_UPC_SIDE_MODULES,
    rightQuiet: ADOBE_UPC_SIDE_MODULES,
    illustratorRatio: true
  },
  ean13: {
    dataModules: 95,
    leftQuiet: 11,
    rightQuiet: 7,
    illustratorRatio: false
  },
  ean8: {
    dataModules: 67,
    leftQuiet: 7,
    rightQuiet: 7,
    illustratorRatio: false
  },
  upce: {
    dataModules: 51,
    leftQuiet: 9,
    rightQuiet: 7,
    illustratorRatio: false
  }
}

export function upcACheckDigit (digits11) {
  const d = String(digits11 || '').replace(/\D/g, '').slice(0, 11).padStart(11, '0')
  let sum = 0
  for (let i = 0; i < 11; i++) {
    sum += Number(d[i]) * (i % 2 === 0 ? 3 : 1)
  }
  return String((10 - (sum % 10)) % 10)
}

export function gtinCheckDigit (body) {
  const d = String(body || '').replace(/\D/g, '')
  let sum = 0
  for (let i = 0; i < d.length; i++) {
    const fromRight = d.length - 1 - i
    sum += Number(d[i]) * (fromRight % 2 === 0 ? 3 : 1)
  }
  return String((10 - (sum % 10)) % 10)
}

export function normalizeUpcADigits (content) {
  let digits = String(content || '').replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length >= 11) {
    const body = digits.slice(0, 11)
    return body + upcACheckDigit(body)
  }
  return ''
}

/** 11/12-digit UPC-A, or EAN-13 that is UPC-A with a leading 0. */
export function looksUpcAPayload (value) {
  const d = String(value ?? '').replace(/\D/g, '')
  return d.length === 11 || d.length === 12 || (d.length === 13 && d.startsWith('0'))
}

function normalizeEan13Digits (content) {
  const digits = String(content || '').replace(/\D/g, '')
  if (digits.length >= 13) return digits.slice(0, 13)
  if (digits.length === 12) return digits + gtinCheckDigit(digits)
  return ''
}

function normalizeEan8Digits (content) {
  const digits = String(content || '').replace(/\D/g, '')
  if (digits.length >= 8) return digits.slice(0, 8)
  if (digits.length === 7) return digits + gtinCheckDigit(digits)
  return ''
}

function encodeDigit (ch, set) {
  const n = Number(ch)
  if (set === 'A') return L[n]
  if (set === 'B') return G[n]
  return R[n]
}

export function encodeUpcABits (content) {
  const d = normalizeUpcADigits(content)
  if (d.length !== 12) return ''
  let bits = START
  for (let i = 0; i < 6; i++) bits += L[Number(d[i])]
  bits += CENTER
  for (let i = 6; i < 12; i++) bits += R[Number(d[i])]
  bits += END
  return bits
}

function encodeEan13Bits (content) {
  const d = normalizeEan13Digits(content)
  if (d.length !== 13) return ''
  const parity = EAN13_PARITY[Number(d[0])]
  let bits = START
  for (let i = 0; i < 6; i++) bits += encodeDigit(d[i + 1], parity[i] === 'A' ? 'A' : 'B')
  bits += CENTER
  for (let i = 7; i < 13; i++) bits += R[Number(d[i])]
  bits += END
  return bits
}

function encodeEan8Bits (content) {
  const d = normalizeEan8Digits(content)
  if (d.length !== 8) return ''
  let bits = START
  for (let i = 0; i < 4; i++) bits += L[Number(d[i])]
  bits += CENTER
  for (let i = 4; i < 8; i++) bits += R[Number(d[i])]
  bits += END
  return bits
}

export function expandUpcE (ns, compact6, check) {
  const d = compact6
  const last = d[5]
  let mid
  if (last >= '0' && last <= '2') mid = d[0] + d[1] + last + '0000' + d[2] + d[3] + d[4]
  else if (last === '3') mid = d[0] + d[1] + d[2] + '00000' + d[3] + d[4]
  else if (last === '4') mid = d[0] + d[1] + d[2] + d[3] + '00000' + d[4]
  else mid = d[0] + d[1] + d[2] + d[3] + d[4] + '0000' + last
  return ns + mid + check
}

function normalizeUpcEParts (content) {
  const d = String(content || '').replace(/\D/g, '')
  if (d.length === 6) {
    const ns = '0'
    const compact6 = d
    const upcABody = expandUpcE(ns, compact6, '0').slice(0, 11)
    const check = gtinCheckDigit(upcABody)
    return { ns, compact6, check, digits: ns + compact6 + check }
  }
  if (d.length === 7) {
    const ns = '0'
    const compact6 = d.slice(0, 6)
    const check = d[6]
    return { ns, compact6, check, digits: ns + compact6 + check }
  }
  if (d.length === 8) {
    const ns = d[0]
    const compact6 = d.slice(1, 7)
    const check = d[7]
    if (ns !== '0' && ns !== '1') return null
    return { ns, compact6, check, digits: ns + compact6 + check }
  }
  return null
}

function encodeUpcEBits (content) {
  const parts = normalizeUpcEParts(content)
  if (!parts) return { bits: '', digits: '' }
  let parity = UPCE_PARITY0[Number(parts.check)]
  if (parts.ns === '1') {
    parity = [...parity].map((ch) => ch === 'A' ? 'B' : 'A').join('')
  }
  let bits = START
  for (let i = 0; i < 6; i++) bits += encodeDigit(parts.compact6[i], parity[i] === 'A' ? 'A' : 'B')
  bits += UPCE_END
  return { bits, digits: parts.digits }
}

/** Guard-like modules are tall so HRI nests in the data-digit notch. */
export function isAdobeUpcTallModule (i) {
  return (i < 3) ||
    (i >= 3 && i < 10) ||
    (i >= 45 && i < 50) ||
    (i >= 85 && i < 92) ||
    (i >= 92)
}

function isRetailTallModule (format, i) {
  if (format === 'upca') return isAdobeUpcTallModule(i)
  if (format === 'ean13') return i < 3 || (i >= 45 && i < 50) || i >= 92
  if (format === 'ean8') return i < 3 || (i >= 31 && i < 36) || i >= 64
  if (format === 'upce') return i < 3 || i >= 45
  return i < 3
}

function compactFormat (element) {
  const raw = String(element?.barcodeFormat ?? element?.format ?? '').trim()
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function resolveAdobeRetailFormat (element = {}, content = '') {
  const compact = compactFormat(element)
  if (compact === 'EAN8') return 'ean8'
  if (compact === 'UPCE') return 'upce'
  if (
    compact === 'EAN13' || compact === 'EAN' ||
    compact === 'ISBN' || compact === 'ISMN' || compact === 'ISSN'
  ) return 'ean13'
  if (compact === 'UPCA' || compact === 'UPC') return 'upca'
  const digits = String(content || '').replace(/\D/g, '')
  if (digits.length === 13 && !digits.startsWith('0')) return 'ean13'
  if (digits.length === 8) return 'ean8'
  return 'upca'
}

/** ISO 15420 / GS1 quiet-zone modules (UPC-A uses Illustrator 8X). */
export function adobeRetailQuietModules (format) {
  const profile = RETAIL[format] || RETAIL.upca
  return { left: profile.leftQuiet, right: profile.rightQuiet }
}

function isRetailAdobeCompact (compact) {
  return compact === 'UPCA' || compact === 'UPC' || compact === 'UPCE' ||
    compact === 'EAN13' || compact === 'EAN' || compact === 'EAN8' ||
    compact === 'ISBN' || compact === 'ISMN' || compact === 'ISSN'
}

/** Retail EAN/UPC with nested HRI, or an explicit import/renderer flag. */
export function wantsAdobeUpc (element) {
  if (!element || element.type === 'qrcode') return false
  if (element.barcodeRenderer === 'adobe-upc') return true
  if (!(element.barcodeDisplayValue === true || element.displayValue === true)) return false
  return isRetailAdobeCompact(compactFormat(element))
}

function roundPx (n) {
  return Math.round(Number(n) * 100) / 100
}

function roundInk (n) {
  return Math.round(Number(n) * 10000) / 10000
}

function wantsHri (element) {
  return element?.barcodeDisplayValue === true || element?.displayValue === true
}

function encodeRetail (format, content) {
  if (format === 'ean13') {
    const digits = normalizeEan13Digits(content)
    return { digits, bits: encodeEan13Bits(digits) }
  }
  if (format === 'ean8') {
    const digits = normalizeEan8Digits(content)
    return { digits, bits: encodeEan8Bits(digits) }
  }
  if (format === 'upce') {
    const { bits, digits } = encodeUpcEBits(content)
    return { digits, bits }
  }
  const digits = normalizeUpcADigits(content)
  return { digits, bits: encodeUpcABits(digits) }
}

/** 导入钉死的短条高度；钉死时空出 HRI，不再压矮条。 */
function isPinnedBarHeight (element) {
  const barHHint = Number(element?.barcodeBarHeight)
  return Number.isFinite(barHHint) && barHHint > 0
}

function retailHeights (profile, element, module, elH) {
  const barHHint = Number(element.barcodeBarHeight)
  const guardHint = Number(element.barcodeGuardHeight)
  const pinnedShort = Number.isFinite(barHHint) && barHHint > 0
  const pinnedGuard = Number.isFinite(guardHint) && guardHint > 0
  if (profile.illustratorRatio) {
    const shortH = Math.max(8, pinnedShort ? barHHint : elH * ADOBE_UPC_SHORT_RATIO)
    const naturalGuard = shortH / ADOBE_UPC_SHORT_RATIO
    const guardH = pinnedGuard
      ? guardHint
      : (pinnedShort ? naturalGuard : Math.min(elH, naturalGuard))
    return { shortH, guardH }
  }
  const ext = ISO_GUARD_EXTENSION_MODULES * module
  const shortH = Math.max(8, pinnedShort ? barHHint : Math.max(8, elH - ext))
  const guardH = pinnedGuard
    ? guardHint
    : (pinnedShort ? shortH + ext : Math.min(elH, shortH + ext))
  return { shortH, guardH }
}

/**
 * 未钉死条高时压缩短条，让 HRI 基线+descent 落在格子内。
 * @returns {number} 可放入 elH 的短条高度
 */
function fitShortHeightToBox (shortH, elH, middleFont, sideFont) {
  const descent = Math.max(middleFont, sideFont) * ADOBE_UPC_DESCENT_EM + HRI_CLIP_PAD_PX
  const maxShort = (elH - descent) / (1 + ADOBE_UPC_SIDE_BASELINE_SHORT)
  if (!(maxShort > 0)) return shortH
  return Math.max(8, Math.min(shortH, maxShort))
}

/** 按压短后的短条重算守卫条高度，守卫条不超过格子。 */
function guardHeightAfterFit (profile, element, module, elH, shortH) {
  const guardHint = Number(element.barcodeGuardHeight)
  if (Number.isFinite(guardHint) && guardHint > 0) return guardHint
  if (profile.illustratorRatio) return Math.min(elH, shortH / ADOBE_UPC_SHORT_RATIO)
  return Math.min(elH, shortH + ISO_GUARD_EXTENSION_MODULES * module)
}

/** Right edge of HRI ink; PDF boxes are often slightly narrower than Arial advance. */
function glyphInkRight (g) {
  const w = Number(g.width) || 0
  const fs = Number(g.fontSize) || 0
  const sx = Number(g.scaleX) > 0.02 ? Number(g.scaleX) : 1
  const advance = Math.max(w, fs * 0.72 * sx)
  if (g.align === 'center') return Number(g.x) + w / 2 + advance / 2
  if (g.align === 'right') return Number(g.x) + w
  return Number(g.x) + advance
}

function pushGlyph (glyphs, spec) {
  glyphs.push({
    text: spec.text,
    x: roundPx(spec.x),
    width: roundPx(spec.width),
    align: spec.align || 'center',
    baseline: roundPx(spec.baseline),
    fontSize: spec.fontSize,
    scaleX: spec.scaleX
  })
}

function layoutRetailHri (format, digits, barsX, originX, module, fonts) {
  const glyphs = []
  const cell = 7 * module
  const { middleFont, sideFont, middleBaseline, sideBaseline, midSx, sideSx } = fonts
  if (format === 'upca' && digits.length === 12) {
    pushGlyph(glyphs, {
      text: digits[0],
      x: originX,
      width: ADOBE_UPC_SIDE_MODULES * module,
      baseline: sideBaseline,
      fontSize: sideFont,
      scaleX: sideSx
    })
    const leftDataX = barsX + (3 + 7) * module
    for (let i = 0; i < 5; i++) {
      pushGlyph(glyphs, {
        text: digits[1 + i],
        x: leftDataX + i * cell,
        width: cell,
        baseline: middleBaseline,
        fontSize: middleFont,
        scaleX: midSx
      })
    }
    const rightDataX = barsX + (3 + 7 + 35 + 5) * module
    for (let i = 0; i < 5; i++) {
      pushGlyph(glyphs, {
        text: digits[6 + i],
        x: rightDataX + i * cell,
        width: cell,
        baseline: middleBaseline,
        fontSize: middleFont,
        scaleX: midSx
      })
    }
    pushGlyph(glyphs, {
      text: digits[11],
      x: barsX + UPC_A_DATA_MODULES * module,
      width: ADOBE_UPC_SIDE_MODULES * module,
      baseline: sideBaseline,
      fontSize: sideFont,
      scaleX: sideSx
    })
    return glyphs
  }
  if (format === 'ean13' && digits.length === 13) {
    pushGlyph(glyphs, {
      text: digits[0],
      x: originX,
      width: 11 * module,
      baseline: sideBaseline,
      fontSize: sideFont,
      scaleX: sideSx
    })
    const leftDataX = barsX + 3 * module
    for (let i = 0; i < 6; i++) {
      pushGlyph(glyphs, {
        text: digits[1 + i],
        x: leftDataX + i * cell,
        width: cell,
        baseline: middleBaseline,
        fontSize: middleFont,
        scaleX: midSx
      })
    }
    const rightDataX = barsX + (3 + 42 + 5) * module
    for (let i = 0; i < 6; i++) {
      pushGlyph(glyphs, {
        text: digits[7 + i],
        x: rightDataX + i * cell,
        width: cell,
        baseline: middleBaseline,
        fontSize: middleFont,
        scaleX: midSx
      })
    }
    return glyphs
  }
  if (format === 'ean8' && digits.length === 8) {
    const leftDataX = barsX + 3 * module
    for (let i = 0; i < 4; i++) {
      pushGlyph(glyphs, {
        text: digits[i],
        x: leftDataX + i * cell,
        width: cell,
        baseline: middleBaseline,
        fontSize: middleFont,
        scaleX: midSx
      })
    }
    const rightDataX = barsX + (3 + 28 + 5) * module
    for (let i = 0; i < 4; i++) {
      pushGlyph(glyphs, {
        text: digits[4 + i],
        x: rightDataX + i * cell,
        width: cell,
        baseline: middleBaseline,
        fontSize: middleFont,
        scaleX: midSx
      })
    }
    return glyphs
  }
  if (format === 'upce' && digits.length >= 7) {
    const d = digits.length === 8 ? digits : ('0' + digits)
    pushGlyph(glyphs, {
      text: d[0],
      x: originX,
      width: 9 * module,
      baseline: sideBaseline,
      fontSize: sideFont,
      scaleX: sideSx
    })
    const dataX = barsX + 3 * module
    for (let i = 0; i < 6; i++) {
      pushGlyph(glyphs, {
        text: d[1 + i],
        x: dataX + i * cell,
        width: cell,
        baseline: middleBaseline,
        fontSize: middleFont,
        scaleX: midSx
      })
    }
    pushGlyph(glyphs, {
      text: d[7],
      x: barsX + 51 * module,
      width: 7 * module,
      baseline: sideBaseline,
      fontSize: sideFont,
      scaleX: sideSx
    })
  }
  return glyphs
}

/**
 * Layout in CSS px, origin at the symbol box top-left.
 * Covers UPC-A (Illustrator TG-211), EAN-13, EAN-8, and UPC-E (ISO 15420).
 * @returns {{ width: number, height: number, color: string, fontFamily: string, bars: object[], glyphs: object[] } | null}
 */
export function layoutAdobeUpc (content, element = {}) {
  const format = resolveAdobeRetailFormat(element, content)
  const profile = RETAIL[format] || RETAIL.upca
  const { digits, bits } = encodeRetail(format, content)
  if (!bits || bits.length !== profile.dataModules) return null

  const elW = Math.max(1, Number(element.width) || 0)
  const elH = Math.max(1, Number(element.height) || 0)
  const totalModules = profile.leftQuiet + profile.dataModules + profile.rightQuiet
  const pinned = Number(element.barcodeModuleCssPx)
  const module = Math.max(
    MODULE_FLOOR_CSS,
    Number.isFinite(pinned) && pinned > 0
      ? pinned
      : (elW > 0 ? elW / totalModules : MODULE_FLOOR_CSS)
  )
  const totalW = totalModules * module
  const barsXHint = Number(element.barcodeBarsX)
  const pinBars = Number.isFinite(barsXHint) && barsXHint > 0
  const originX = pinBars ? 0 : (elW > totalW + 0.51 ? (elW - totalW) / 2 : 0)
  const barsX = pinBars ? barsXHint : originX + profile.leftQuiet * module

  let { shortH, guardH } = retailHeights(profile, element, module, elH)

  const middleFont = Math.max(
    8,
    Number(element.barcodeFontSize) > 0
      ? Number(element.barcodeFontSize)
      : module * 6.23
  )
  const sideFont = Math.max(
    7,
    Number(element.barcodeSideFontSize) > 0
      ? Number(element.barcodeSideFontSize)
      : roundPx(middleFont * ADOBE_UPC_SIDE_FONT_RATIO)
  )
  if (wantsHri(element) && !isPinnedBarHeight(element)) {
    shortH = fitShortHeightToBox(shortH, elH, middleFont, sideFont)
    guardH = guardHeightAfterFit(profile, element, module, elH, shortH)
  }
  const middleScaleX = Number(element.barcodeHriScaleX)
  const sideScaleX = Number(element.barcodeSideScaleX)
  const midSx = Number.isFinite(middleScaleX) && middleScaleX > 0.02 ? middleScaleX : 1
  const sideSx = Number.isFinite(sideScaleX) && sideScaleX > 0.02 ? sideScaleX : 1
  const middleBaseline = shortH + shortH * ADOBE_UPC_MIDDLE_BASELINE_SHORT
  const sideBaseline = shortH + shortH * ADOBE_UPC_SIDE_BASELINE_SHORT
  const color = (element.style && element.style.color) || '#000000'
  const fontFamily = element.barcodeFont || 'Arial'

  const inkRects = Array.isArray(element.barcodeInkRects) ? element.barcodeInkRects : []
  const inkContent = String(element.barcodeInkContent || '')
  const useInk = inkRects.length >= 12 && (!inkContent || inkContent === digits)

  const bars = []
  if (useInk) {
    for (const b of inkRects) {
      bars.push({
        x: roundInk(b.x),
        y: roundInk(b.y),
        w: roundInk(b.w),
        h: roundInk(b.h)
      })
    }
  } else {
    let runStart = -1
    const flush = (end) => {
      if (runStart < 0) return
      const tall = isRetailTallModule(format, runStart)
      bars.push({
        x: roundPx(barsX + runStart * module),
        y: 0,
        w: roundPx((end - runStart) * module),
        h: roundPx(tall ? guardH : shortH)
      })
      runStart = -1
    }
    for (let i = 0; i <= bits.length; i++) {
      const on = i < bits.length && bits[i] === '1'
      if (on && runStart < 0) runStart = i
      else if (!on && runStart >= 0) flush(i)
    }
  }

  const glyphs = []
  if (wantsHri(element)) {
    const imported = Array.isArray(element.barcodeHriDigits) ? element.barcodeHriDigits : []
    if (imported.length === digits.length) {
      for (let i = 0; i < imported.length; i++) {
        const g = imported[i]
        glyphs.push({
          text: digits[i],
          x: roundPx(g.x),
          width: roundPx(Number(g.width) > 0 ? g.width : module * 7),
          align: g.align || 'start',
          baseline: roundPx(g.baseline),
          fontSize: Number(g.fontSize) > 0 ? Number(g.fontSize) : middleFont,
          scaleX: Number(g.scaleX) > 0.02 ? Number(g.scaleX) : 1
        })
      }
    } else {
      glyphs.push(...layoutRetailHri(format, digits, barsX, originX, module, {
        middleFont,
        sideFont,
        middleBaseline,
        sideBaseline,
        midSx,
        sideSx
      }))
    }
  }

  let inkBottom = guardH
  let inkRight = originX + totalW
  for (const g of glyphs) {
    inkBottom = Math.max(inkBottom, g.baseline + g.fontSize * ADOBE_UPC_DESCENT_EM + HRI_CLIP_PAD_PX)
    inkRight = Math.max(inkRight, glyphInkRight(g))
  }

  return {
    format,
    digits,
    module: roundPx(module),
    width: roundPx(Math.max(elW, totalW, inkRight + 1.5)),
    height: roundPx(Math.max(elH, inkBottom)),
    shortH: roundPx(shortH),
    guardH: roundPx(guardH),
    color,
    fontFamily,
    bars,
    glyphs
  }
}

export function adobeUpcSvg (layout) {
  if (!layout) return ''
  const { width, height, color, fontFamily, bars, glyphs } = layout
  const rects = bars.map((b) =>
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${color}"/>`
  ).join('')
  const texts = glyphs.map((g) => {
    const x = g.align === 'center' ? g.x + g.width / 2 : g.x
    const anchor = g.align === 'center' ? 'middle' : (g.align === 'right' ? 'end' : 'start')
    const sx = Number(g.scaleX)
    const xf = Number.isFinite(sx) && Math.abs(sx - 1) > 0.02
      ? ` transform="translate(${x} ${g.baseline}) scale(${sx} 1)"`
      : ''
    const tx = xf ? 0 : x
    const ty = xf ? 0 : g.baseline
    return `<text x="${tx}" y="${ty}" text-anchor="${anchor}"${xf} ` +
      `font-family="${fontFamily},Helvetica,sans-serif" font-size="${g.fontSize}" ` +
      `fill="${color}">${g.text}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" ` +
    `shape-rendering="crispEdges" style="display:block">${rects}${texts}</svg>`
}
