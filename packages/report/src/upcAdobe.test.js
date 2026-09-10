import { describe, expect, it } from 'vitest'
import {
  ADOBE_UPC_DESCENT_EM,
  ADOBE_UPC_SHORT_RATIO,
  ADOBE_UPC_SIDE_MODULES,
  ISO_GUARD_EXTENSION_MODULES,
  adobeRetailQuietModules,
  encodeUpcABits,
  layoutAdobeUpc,
  normalizeUpcADigits,
  upcACheckDigit,
  wantsAdobeUpc
} from './upcAdobe.js'

const TG = '191908755830'
const PT = 96 / 72
const MODULE_PT = 2.01
const MODULE_CSS = MODULE_PT * PT

describe('Adobe UPC-A encoder', () => {
  it('computes the UPC-A check digit', () => {
    expect(upcACheckDigit('19190875583')).toBe('0')
    expect(normalizeUpcADigits(TG)).toBe(TG)
    expect(normalizeUpcADigits('19190875583')).toBe(TG)
    expect(normalizeUpcADigits('191908755831')).toBe(TG)
    expect(normalizeUpcADigits('0191908755830')).toBe(TG)
  })

  it('encodes 95 modules and 30 black runs (Illustrator drawing count)', () => {
    const bits = encodeUpcABits(TG)
    expect(bits).toHaveLength(95)
    expect(bits[0]).toBe('1')
    expect(bits.slice(-3)).toBe('101')
    let runs = 0
    let on = false
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] === '1' && !on) {
        runs++
        on = true
      } else if (bits[i] === '0') {
        on = false
      }
    }
    expect(runs).toBe(30)
  })
})

describe('wantsAdobeUpc', () => {
  it('opts in for classic UPC-A with nested HRI', () => {
    expect(wantsAdobeUpc({ barcodeFormat: 'upca', barcodeDisplayValue: true })).toBe(true)
    expect(wantsAdobeUpc({ barcodeFormat: 'UPC', displayValue: true })).toBe(true)
    expect(wantsAdobeUpc({ barcodeFormat: 'upca' })).toBe(false)
    expect(wantsAdobeUpc({ barcodeFormat: 'code128', barcodeDisplayValue: true })).toBe(false)
    expect(wantsAdobeUpc({ barcodeRenderer: 'adobe-upc', barcodeFormat: 'upca' })).toBe(true)
  })

  it('opts in for ISO 15420 retail family when HRI is on', () => {
    expect(wantsAdobeUpc({ barcodeFormat: 'ean13', barcodeDisplayValue: true })).toBe(true)
    expect(wantsAdobeUpc({ barcodeFormat: 'ean8', displayValue: true })).toBe(true)
    expect(wantsAdobeUpc({ barcodeFormat: 'upce', barcodeDisplayValue: true })).toBe(true)
    expect(wantsAdobeUpc({ barcodeFormat: 'ean13' })).toBe(false)
  })
})

describe('layoutAdobeUpc TG-211', () => {
  const element = {
    width: 111 * MODULE_CSS,
    height: (210.44 - 44.61) * PT + 8.4 * PT,
    barcodeFormat: 'upca',
    barcodeDisplayValue: true,
    barcodeBarHeight: 153.9 * PT,
    barcodeModuleCssPx: MODULE_CSS,
    barcodeFontSize: 12.53 * PT,
    barcodeFont: 'Arial'
  }

  it('places 30 bars and 12 per-digit HRI glyphs', () => {
    const layout = layoutAdobeUpc(TG, element)
    expect(layout).toBeTruthy()
    expect(layout.bars).toHaveLength(30)
    expect(layout.glyphs).toHaveLength(12)
    expect(layout.glyphs.map((g) => g.text).join('')).toBe(TG)
    expect(layout.glyphs[1].text).toBe('9')
    expect(layout.glyphs[5].text).toBe('8')
  })

  it('matches Illustrator bar x / heights at module 2.01pt', () => {
    const layout = layoutAdobeUpc(TG, element)
    const side = ADOBE_UPC_SIDE_MODULES * MODULE_CSS
    expect(layout.bars[0].x).toBeCloseTo(side, 1)
    const last = layout.bars[layout.bars.length - 1]
    expect(last.x + last.w).toBeCloseTo(side + 95 * MODULE_CSS, 1)
    expect(layout.shortH).toBeCloseTo(153.9 * PT, 1)
    expect(layout.guardH).toBeCloseTo(165.83 * PT, 1)
    expect(layout.bars[0].h).toBeCloseTo(layout.guardH, 2)
    const short = layout.bars.find((b) => Math.abs(b.h - layout.shortH) < 0.2)
    expect(short).toBeTruthy()
    expect(layout.guardH / layout.shortH).toBeCloseTo(1 / ADOBE_UPC_SHORT_RATIO, 4)
  })

  it('nests middle digits in 7-module cells under the notch', () => {
    const layout = layoutAdobeUpc(TG, element)
    const cell = 7 * MODULE_CSS
    const left0 = layout.glyphs[1]
    const left1 = layout.glyphs[2]
    expect(left1.x - left0.x).toBeCloseTo(cell, 1)
    expect(left0.width).toBeCloseTo(cell, 1)
    expect(left0.fontSize).toBeGreaterThan(layout.glyphs[0].fontSize)
    expect(layout.glyphs[0].baseline).toBeGreaterThan(layout.shortH)
    expect(layout.glyphs[layout.glyphs.length - 1].text).toBe('0')
    expect(layout.glyphs[layout.glyphs.length - 1].x).toBeLessThan(layout.width)
    expect(layout.width).toBeGreaterThanOrEqual(
      layout.glyphs[layout.glyphs.length - 1].x + layout.glyphs[layout.glyphs.length - 1].width
    )
    expect(layout.height).toBeGreaterThanOrEqual(
      layout.glyphs.reduce((m, g) => Math.max(m, g.baseline + g.fontSize * 0.212), 0)
    )
  })

  it('keeps unpinned HRI digits inside a short box', () => {
    const layout = layoutAdobeUpc(TG, {
      width: 150,
      height: 37,
      barcodeFormat: 'upca',
      barcodeDisplayValue: true
    })
    const inkBottom = layout.glyphs.reduce(
      (m, g) => Math.max(m, g.baseline + g.fontSize * ADOBE_UPC_DESCENT_EM),
      0
    )
    expect(inkBottom).toBeLessThanOrEqual(37)
    expect(layout.height).toBeLessThanOrEqual(37)
    expect(layout.glyphs.map((g) => g.text).join('')).toBe(TG)
  })

  it('does not stretch bars when the element is taller than the guards', () => {
    const layout = layoutAdobeUpc(TG, { ...element, height: element.height + 40 })
    expect(layout.shortH).toBeCloseTo(153.9 * PT, 1)
    expect(layout.guardH).toBeCloseTo(165.83 * PT, 1)
  })

  it('applies imported HRI scaleX on middle digits', () => {
    const layout = layoutAdobeUpc(TG, { ...element, barcodeHriScaleX: 0.765 })
    expect(layout.glyphs[1].scaleX).toBeCloseTo(0.765, 3)
    expect(layout.glyphs[0].scaleX).toBe(1)
  })

  it('pins HRI baseline to short-bar height, not imported font size', () => {
    const layout = layoutAdobeUpc(TG, { ...element, barcodeFontSize: 14.33 * PT })
    expect(layout.glyphs[1].baseline).toBeCloseTo(153.9 * PT + 15.05 * PT, 1)
    expect(layout.glyphs[0].baseline).toBeCloseTo(153.9 * PT + 16.84 * PT, 1)
  })

  it('uses imported glyph origins and barcodeBarsX without recentering bars', () => {
    const side = ADOBE_UPC_SIDE_MODULES * MODULE_CSS
    const digits = TG.split('').map((text, i) => ({
      text,
      x: i === 0 ? 0 : side + i * 7,
      baseline: 220,
      fontSize: 16.7,
      scaleX: i === 0 || i === 11 ? 1.02 : 0.765,
      width: 10,
      align: 'start'
    }))
    const layout = layoutAdobeUpc(TG, {
      ...element,
      width: element.width + 8,
      barcodeBarsX: side + 8,
      barcodeHriDigits: digits
    })
    expect(layout.bars[0].x).toBeCloseTo(side + 8, 1)
    expect(layout.glyphs[0].x).toBe(0)
    expect(layout.glyphs[0].align).toBe('start')
    expect(layout.glyphs[1].scaleX).toBeCloseTo(0.765, 3)
  })

  it('paints imported ink rectangles instead of uniform modules', () => {
    const ink = Array.from({ length: 12 }, (_, i) => ({
      x: 20 + i * 8,
      y: 0.004,
      w: i === 10 ? 5.4773 : 2.6747,
      h: i < 3 ? 221.103 : 205.199
    }))
    const layout = layoutAdobeUpc(TG, {
      ...element,
      barcodeInkContent: TG,
      barcodeInkRects: ink
    })
    expect(layout.bars).toHaveLength(12)
    expect(layout.bars[10].w).toBeCloseTo(5.4773, 4)
    expect(layout.bars[0].w).toBeCloseTo(2.6747, 4)
    expect(layout.bars[0].h).toBeCloseTo(221.103, 3)
  })

  it('ignores imported ink when the UPC digits change', () => {
    const ink = Array.from({ length: 12 }, (_, i) => ({
      x: i * 8,
      y: 0,
      w: 9,
      h: 100
    }))
    const layout = layoutAdobeUpc('000000000000', {
      ...element,
      barcodeInkContent: TG,
      barcodeInkRects: ink
    })
    expect(layout.bars[0].w).toBeCloseTo(MODULE_CSS, 1)
  })

  it('updates imported HRI digit text when the UPC value changes', () => {
    const digits = [...TG].map((ch, i) => ({
      text: ch,
      x: i * 10,
      baseline: 220,
      fontSize: 16,
      scaleX: 1,
      width: 10,
      align: 'start'
    }))
    const layout = layoutAdobeUpc('000000000000', {
      ...element,
      barcodeHriDigits: digits,
      barcodeInkContent: TG
    })
    expect(layout.glyphs.map((g) => g.text).join('')).toBe('000000000000')
    expect(layout.glyphs[0].x).toBe(0)
    expect(layout.glyphs[1].x).toBe(10)
  })

  it('keeps pinned X and bar origin when UPC digits change', () => {
    const before = layoutAdobeUpc(TG, element)
    const after = layoutAdobeUpc('000000000000', element)
    expect(after.module).toBeCloseTo(before.module, 5)
    expect(after.bars[0].x).toBeCloseTo(before.bars[0].x, 5)
    expect(after.shortH).toBeCloseTo(before.shortH, 5)
    expect(after.guardH).toBeCloseTo(before.guardH, 5)
    expect(after.glyphs.map((g) => g.text).join('')).toBe('000000000000')
  })
})

describe('ISO 15420 EAN-13 / EAN-8 / UPC-E layout', () => {
  const module = 2
  const ean13 = '5901234123457'

  it('uses GS1 quiet zones', () => {
    expect(adobeRetailQuietModules('ean13')).toEqual({ left: 11, right: 7 })
    expect(adobeRetailQuietModules('ean8')).toEqual({ left: 7, right: 7 })
    expect(adobeRetailQuietModules('upce')).toEqual({ left: 9, right: 7 })
    expect(adobeRetailQuietModules('upca')).toEqual({ left: 8, right: 8 })
  })

  it('places 13 nested HRI glyphs and 11X left quiet', () => {
    const layout = layoutAdobeUpc(ean13, {
      width: 113 * module,
      height: 80,
      barcodeFormat: 'ean13',
      barcodeDisplayValue: true,
      barcodeModuleCssPx: module
    })
    expect(layout).toBeTruthy()
    expect(layout.format).toBe('ean13')
    expect(layout.glyphs).toHaveLength(13)
    expect(layout.glyphs.map((g) => g.text).join('')).toBe(ean13)
    expect(layout.bars[0].x).toBeCloseTo(11 * module, 1)
    expect(layout.glyphs[0].width).toBeCloseTo(11 * module, 1)
    expect(layout.glyphs[1].x).toBeCloseTo(11 * module + 3 * module, 1)
    expect(layout.glyphs[2].x - layout.glyphs[1].x).toBeCloseTo(7 * module, 1)
  })

  it('extends only guard bars by 5X', () => {
    const layout = layoutAdobeUpc(ean13, {
      width: 113 * module,
      height: 80,
      barcodeFormat: 'ean13',
      barcodeDisplayValue: true,
      barcodeModuleCssPx: module
    })
    expect(layout.guardH - layout.shortH).toBeCloseTo(ISO_GUARD_EXTENSION_MODULES * module, 1)
    expect(layout.bars[0].h).toBeCloseTo(layout.guardH, 2)
    const short = layout.bars.find((b) => Math.abs(b.h - layout.shortH) < 0.2)
    expect(short).toBeTruthy()
    expect(short.x).toBeGreaterThan(layout.bars[0].x + 3 * module - 0.5)
  })

  it('nests EAN-8 4+4 digits with 7X quiet', () => {
    const layout = layoutAdobeUpc('96385074', {
      width: 81 * module,
      height: 60,
      barcodeFormat: 'ean8',
      barcodeDisplayValue: true,
      barcodeModuleCssPx: module
    })
    expect(layout.glyphs).toHaveLength(8)
    expect(layout.glyphs.map((g) => g.text).join('')).toBe('96385074')
    expect(layout.bars[0].x).toBeCloseTo(7 * module, 1)
    expect(layout.guardH - layout.shortH).toBeCloseTo(ISO_GUARD_EXTENSION_MODULES * module, 1)
  })

  it('places UPC-E number-system and check digits in the quiet zones', () => {
    const layout = layoutAdobeUpc('01234565', {
      width: 67 * module,
      height: 60,
      barcodeFormat: 'upce',
      barcodeDisplayValue: true,
      barcodeModuleCssPx: module
    })
    expect(layout.glyphs).toHaveLength(8)
    expect(layout.glyphs[0].text).toBe('0')
    expect(layout.glyphs[7].text).toBe('5')
    expect(layout.bars[0].x).toBeCloseTo(9 * module, 1)
  })
})
