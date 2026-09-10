import { describe, expect, it } from 'vitest'
import {
  BARCODE_BWIP_SYMBOLS,
  BARCODE_MODULE_DOTS,
  BARCODE_MODULE_MM,
  barcodeBwipDrawOptions,
  barcodeGeometry,
  barcodeHriLayout,
  barcodeJsBarcodeOptions,
  barcodePlaceScale,
  barcodeWantsDisplayValue,
  estimateCode128Modules,
  syncBarcodeBoxToPinnedX,
  coerceBarcodeSymbology,
  designerBarcodeSample,
  encodeBarcodeSymbol,
  fitGradeAModuleCssPx,
  gradeAModuleCssPx,
  gradeAModuleDots,
  inferRetailBarcodeFormat,
  isUpcFamilyFormat,
  listBwipSymbols,
  matrixFitGeometry,
  QR_QUIET_MODULES,
  resolveBwipBcid,
  upcDisplaySideModules
} from './barcodeGrade.js'

describe('UPC-A encode is first-class', () => {
  it('encodes TG-211 UPC-A and never falls back to Code 128', () => {
    const sym = encodeBarcodeSymbol('191908755830', 'upca')
    expect(sym.format).toBe('upca')
    expect(sym.width).toBe(95)
    expect(encodeBarcodeSymbol('002-05-6309', 'upca')).toBeNull()
    expect(encodeBarcodeSymbol('', 'upca')).toBeNull()
  })

  it('uses the catalog sample on the designer canvas when UPC is empty', () => {
    expect(designerBarcodeSample('', { barcodeFormat: 'upca' })).toBe('191908755830')
    expect(designerBarcodeSample('002-05-6309', { barcodeFormat: 'upca' })).toBe('191908755830')
    expect(designerBarcodeSample('19190875583', { barcodeFormat: 'upca' })).toBe('19190875583')
    expect(designerBarcodeSample('HELLO', { barcodeFormat: 'code128' })).toBe('HELLO')
    expect(designerBarcodeSample('', { barcodeFormat: 'isbn' })).toBe('9780201379624')
  })
})

describe('UPC Grade-A geometry', () => {
  it('detects UPC family and displayValue flag', () => {
    expect(isUpcFamilyFormat('UPC')).toBe(true)
    expect(isUpcFamilyFormat('upca')).toBe(true)
    expect(isUpcFamilyFormat({ barcodeFormat: 'EAN13' })).toBe(true)
    expect(isUpcFamilyFormat('isbn')).toBe(true)
    expect(isUpcFamilyFormat({ barcodeFormat: 'CODE128' })).toBe(false)
    expect(barcodeWantsDisplayValue({ barcodeFormat: 'UPC', barcodeDisplayValue: true })).toBe(true)
    expect(barcodeWantsDisplayValue({ barcodeFormat: 'UPC' })).toBe(false)
    expect(upcDisplaySideModules('UPC', true)).toEqual({ left: 8, right: 8 })
    expect(upcDisplaySideModules('ean13', true)).toEqual({ left: 11, right: 0 })
    expect(upcDisplaySideModules('upce', true)).toEqual({ left: 9, right: 7 })
    expect(QR_QUIET_MODULES).toBe(4)
  })

  it('never uses a module thinner than the Grade-A floor', () => {
    const floor = gradeAModuleCssPx()
    expect(floor).toBeGreaterThanOrEqual(2)
    expect(fitGradeAModuleCssPx(50, 111)).toBe(floor)
    expect(fitGradeAModuleCssPx(400, 111)).toBeGreaterThanOrEqual(floor)
  })

  it('builds classic UPC-A with nested HRI on Grade-A integer modules', () => {
    const opt = barcodeJsBarcodeOptions('191908755830', {
      barcodeFormat: 'UPC',
      barcodeFit: 'element',
      barcodeDisplayValue: true,
      barcodeFontSize: 16,
      barcodeTextMargin: 2,
      width: 308,
      height: 223
    })
    expect(opt.format).toBe('upca')
    expect(opt.displayValue).toBe(true)
    expect(opt.gradeA).toBe(true)
    expect(opt.width).toBeGreaterThanOrEqual(gradeAModuleCssPx())
    expect(opt.fontSize).toBeLessThanOrEqual(opt.width * 10)
    expect(opt.canvasWidth).toBe(
      (95 + 16) * opt.width + opt.marginLeft + opt.marginRight
    )
    expect(opt.height + opt.fontSize + opt.textMargin + opt.marginBottom).toBe(
      opt.canvasHeight
    )
    expect(opt.height).toBeGreaterThanOrEqual(40)
    expect(opt.canvasWidth).toBeLessThanOrEqual(308)
  })

  it('only allows integer place scales', () => {
    expect(barcodePlaceScale(222, 200, 308, 223)).toBe(1)
    expect(barcodePlaceScale(100, 50, 220, 120)).toBe(2)
    expect(barcodePlaceScale(300, 100, 200, 80)).toBe(1)
  })

  it('maps Grade-A CSS modules back to ≥ BARCODE_MODULE_DOTS at 300dpi', () => {
    const opt = barcodeJsBarcodeOptions('191908755830', {
      barcodeFormat: 'UPC',
      barcodeDisplayValue: true,
      width: 308,
      height: 223
    })
    expect(opt.geometry.moduleDots).toBeGreaterThanOrEqual(BARCODE_MODULE_DOTS)
  })

  it('honours pinned barcodeModuleCssPx so import width matches original', () => {
    const pinned = 2.68
    const opt = barcodeJsBarcodeOptions('191908755830', {
      barcodeFormat: 'UPC',
      barcodeFit: 'element',
      barcodeDisplayValue: true,
      barcodeFontSize: 16.71,
      barcodeTextMargin: 0,
      barcodeModuleCssPx: pinned,
      width: 308,
      height: 223
    })
    expect(opt.width).toBeCloseTo(pinned, 5)
    expect(opt.canvasWidth).toBeCloseTo(
      (95 + 16) * pinned + opt.marginLeft + opt.marginRight,
      5
    )
    expect(opt.gradeA).toBe(true)
    expect(opt.geometry.moduleDots).toBeGreaterThanOrEqual(BARCODE_MODULE_DOTS)
    expect(opt.marginBottom).toBeGreaterThan(0)
    expect(opt.canvasHeight).toBe(
      opt.height + opt.fontSize + opt.textMargin + opt.marginBottom
    )
  })

  it('leaves HRI descent room so digits are not clipped', () => {
    const opt = barcodeJsBarcodeOptions('191908755830', {
      barcodeFormat: 'UPC',
      barcodeFit: 'element',
      barcodeDisplayValue: true,
      barcodeFontSize: 16.7,
      barcodeTextMargin: 0,
      width: 308,
      height: 230
    })
    expect(opt.marginBottom).toBeGreaterThanOrEqual(Math.ceil(16.7 * 0.3))
    expect(opt.canvasHeight).toBeGreaterThan(opt.height + opt.fontSize)
  })

  it('keeps Grade-A module width in mm across printer dpi (203 / 300)', () => {
    expect(gradeAModuleDots(300)).toBe(4)
    expect(gradeAModuleDots(203)).toBe(3)
    const at300 = barcodeGeometry({ content: 'LSX1', dpi: 300 })
    const at203 = barcodeGeometry({ content: 'LSX1', dpi: 203 })
    expect(at300.gradeA).toBe(true)
    expect(at203.gradeA).toBe(true)
    expect(at300.moduleMm).toBeGreaterThanOrEqual(BARCODE_MODULE_MM * 0.99)
    expect(at203.moduleMm).toBeGreaterThanOrEqual(BARCODE_MODULE_MM * 0.99)
  })

  it('exposes the core catalog and resolves aliases', () => {
    expect(BARCODE_BWIP_SYMBOLS.length).toBe(28)
    expect(listBwipSymbols({ matrix: true }).map((s) => s.bcid)).toEqual([
      'gs1datamatrix',
      'gs1qrcode',
      'qrcode',
      'datamatrix',
      'pdf417',
      'azteccode'
    ])
    expect(listBwipSymbols({ matrix: false }).some((s) => s.bcid === 'code128')).toBe(true)
    expect(listBwipSymbols({ matrix: false }).some((s) => s.bcid === 'upca')).toBe(true)
    expect(listBwipSymbols({ matrix: false }).some((s) => s.bcid === 'isbn')).toBe(true)
    expect(listBwipSymbols({ matrix: false }).some((s) => s.bcid === 'msi')).toBe(true)
    expect(resolveBwipBcid('UPC')).toBe('upca')
    expect(resolveBwipBcid({ barcodeFormat: 'UPCA' })).toBe('upca')
    expect(resolveBwipBcid('UPCE')).toBe('upce')
    expect(resolveBwipBcid('EAN13')).toBe('ean13')
    expect(resolveBwipBcid('ISBN')).toBe('isbn')
    expect(resolveBwipBcid('EAN14')).toBe('ean14')
    expect(resolveBwipBcid('MSI')).toBe('msi')
    expect(resolveBwipBcid('SSCC')).toBe('sscc')
    expect(resolveBwipBcid('UCC128')).toBe('gs1-128')
    expect(resolveBwipBcid('CODE39')).toBe('code39')
    expect(resolveBwipBcid('ITF')).toBe('interleaved2of5')
    expect(resolveBwipBcid('CODE128')).toBe('code128')
    expect(resolveBwipBcid('gs1-128')).toBe('gs1-128')
    expect(resolveBwipBcid('GS1128')).toBe('gs1-128')
    expect(resolveBwipBcid('datamatrix')).toBe('datamatrix')
    expect(resolveBwipBcid('PDF417')).toBe('pdf417')
    expect(resolveBwipBcid('AZTEC')).toBe('azteccode')
    expect(coerceBarcodeSymbology('0191908755830', 'EAN13')).toEqual({
      format: 'upca',
      content: '191908755830'
    })
    expect(coerceBarcodeSymbology('191908755830', 'EAN13')).toEqual({
      format: 'upca',
      content: '191908755830'
    })
    expect(coerceBarcodeSymbology('191908755830', 'UPC')).toEqual({
      format: 'upca',
      content: '191908755830'
    })
    expect(coerceBarcodeSymbology('191908755830', 'CODE128')).toEqual({
      format: 'code128',
      content: '191908755830'
    })
    expect(inferRetailBarcodeFormat('191908755830', 'code128')).toEqual({
      format: 'upca',
      content: '191908755830'
    })
    expect(inferRetailBarcodeFormat('0191908755830', 'ean13')).toEqual({
      format: 'upca',
      content: '191908755830'
    })
    expect(inferRetailBarcodeFormat('HELLO128', 'code128')).toEqual({
      format: 'code128',
      content: 'HELLO128'
    })
    const packed = barcodeBwipDrawOptions('0191908755830', {
      barcodeFormat: 'EAN13',
      barcodeDisplayValue: true,
      width: 308,
      height: 223
    })
    expect(packed.format).toBe('upca')
    expect(packed.content).toBe('191908755830')
    expect(packed.displayValue).toBe(true)
    expect(packed.modulePx).toBeGreaterThan(1)
    expect(packed.offsetX).toBeGreaterThanOrEqual(0)
    expect(packed.barHeightPx).toBeGreaterThan(1)
    const code128 = barcodeBwipDrawOptions('191908755830', {
      barcodeFormat: 'code128',
      barcodeDisplayValue: false,
      width: 308,
      height: 80
    })
    expect(code128.format).toBe('code128')
    expect(code128.displayValue).toBe(false)
  })

  it('places UPC-A HRI as twelve digits in 7-module slots', () => {
    const { glyphs } = barcodeHriLayout('191908755830', {
      barcodeFormat: 'upca',
      barcodeDisplayValue: true,
      barcodeFontSize: 16.7,
      barcodeTextMargin: 0,
      barcodeModuleCssPx: 2.68,
      width: 308,
      height: 225
    })
    expect(glyphs).toHaveLength(12)
    expect(glyphs.map((g) => g.text).join('')).toBe('191908755830')
    expect(glyphs[1].text).toBe('9')
    expect(glyphs[5].text).toBe('8')
    const leftPitch = glyphs[2].x - glyphs[1].x
    expect(leftPitch).toBeCloseTo(7 * 2.68, 5)
    expect(glyphs[0].fontSize).toBeLessThan(glyphs[1].fontSize)
  })

  it('places EAN-13 HRI with ISO 11X left quiet and 13 digits', () => {
    const m = 2
    const { glyphs, opt } = barcodeHriLayout('5901234123457', {
      barcodeFormat: 'ean13',
      barcodeDisplayValue: true,
      barcodeFontSize: 16,
      barcodeTextMargin: 0,
      barcodeModuleCssPx: m,
      width: 113 * m,
      height: 80
    })
    expect(opt.format).toBe('ean13')
    expect(glyphs).toHaveLength(13)
    expect(glyphs.map((g) => g.text).join('')).toBe('5901234123457')
    expect(glyphs[0].width).toBeCloseTo(11 * m, 5)
    expect(glyphs[1].x - glyphs[0].x).toBeCloseTo(11 * m + 3 * m, 5)
    expect(glyphs[2].x - glyphs[1].x).toBeCloseTo(7 * m, 5)
  })
})

describe('Illustrator Code 128 pin', () => {
  it('counts Annex E modules including a Code C latch', () => {
    expect(estimateCode128Modules('HELLO1234')).toBe(123)
    expect(estimateCode128Modules('AB12')).toBe(79)
  })

  it('counts GS1-128 modules from the real FNC1 encoding', async () => {
    const { encode } = await import('@niqer/barcode')
    const text = '(01)09521234543213(3103)000123'
    expect(estimateCode128Modules(text, { gs1: true })).toBe(
      encode(text, { format: 'gs1-128' }).modules.length
    )
  })

  it('does not pad imported Code 128 with 10X quiet', () => {
    const x = 2
    const modules = estimateCode128Modules('AB12')
    const opt = barcodeJsBarcodeOptions('AB12', {
      barcodeFormat: 'code128',
      barcodeModuleCssPx: x,
      barcodeQuietModules: 0,
      barcodeBarHeight: 40,
      width: modules * x,
      height: 40
    })
    expect(opt.marginLeft).toBe(0)
    expect(opt.marginRight).toBe(0)
    expect(opt.canvasWidth).toBeCloseTo(modules * x, 5)
  })

  it('keeps a pinned X thinner than the Grade-A CSS floor', () => {
    const pinned = 1.5
    expect(pinned).toBeLessThan(gradeAModuleCssPx())
    const opt = barcodeJsBarcodeOptions('AB', {
      barcodeFormat: 'code128',
      barcodeModuleCssPx: pinned,
      barcodeQuietModules: 0,
      width: 200,
      height: 40
    })
    expect(opt.width).toBe(pinned)
  })

  it('honours pinned barcodeBarHeight', () => {
    const opt = barcodeJsBarcodeOptions('AB', {
      barcodeFormat: 'code128',
      barcodeModuleCssPx: 2,
      barcodeQuietModules: 0,
      barcodeBarHeight: 37.5,
      width: 200,
      height: 80
    })
    expect(opt.height).toBe(37.5)
    expect(opt.canvasHeight).toBe(37.5)
  })

  it('UPC-A with Illustrator 8X quiet has no extra side margin', () => {
    const pinned = 2.68
    const opt = barcodeJsBarcodeOptions('191908755830', {
      barcodeFormat: 'upca',
      barcodeDisplayValue: true,
      barcodeModuleCssPx: pinned,
      barcodeQuietModules: 8,
      barcodeTextMargin: 0,
      width: 111 * pinned,
      height: 223
    })
    expect(opt.marginLeft).toBe(0)
    expect(opt.marginRight).toBe(0)
    expect(opt.canvasWidth).toBeCloseTo(111 * pinned, 5)
  })

  it('keeps X and grows width when the payload changes', () => {
    const x = 2.5
    const a = {
      type: 'barcode',
      barcodeFormat: 'code128',
      barcodeFit: 'element',
      barcodeModuleCssPx: x,
      barcodeQuietModules: 0,
      barcodeBarHeight: 40,
      width: 100,
      height: 40,
      content: 'AB'
    }
    const optA = barcodeJsBarcodeOptions('AB', a)
    expect(optA.width).toBe(x)
    expect(optA.canvasWidth).toBeCloseTo(estimateCode128Modules('AB') * x, 5)
    a.content = 'HELLO1234'
    syncBarcodeBoxToPinnedX(a, 'HELLO1234')
    expect(a.width).toBeCloseTo(estimateCode128Modules('HELLO1234') * x, 5)
    expect(barcodeJsBarcodeOptions('HELLO1234', a).width).toBe(x)
  })

  it('does not shrink a UPC box (check digit lives in the quiet zone)', () => {
    const el = {
      type: 'barcode',
      barcodeFormat: 'upca',
      barcodeDisplayValue: true,
      barcodeModuleCssPx: 2.68,
      barcodeQuietModules: 8,
      width: 320,
      height: 220,
      content: '191908755830'
    }
    syncBarcodeBoxToPinnedX(el, el.content)
    expect(el.width).toBe(320)
  })
})

describe('in-box fit', () => {
  it('fits a QR into the element box with only 1-module in-box quiet', () => {
    const fit = matrixFitGeometry({ width: 21, height: 21, format: 'qrcode' }, 75, 75)
    expect(fit.quiet).toBe(1)
    expect(fit.usedW).toBeCloseTo(75, 5)
    expect(fit.usedH).toBeCloseTo(75, 5)
    expect(fit.offsetX).toBeCloseTo(fit.module, 5)
  })

  it('does not pad a designer Code 128 with 10X in-box quiet', () => {
    const opt = barcodeJsBarcodeOptions('AB12', {
      barcodeFormat: 'code128',
      barcodeFit: 'element',
      barcodeDisplayValue: false,
      width: 150,
      height: 40
    })
    expect(opt.marginLeft).toBe(0)
    expect(opt.marginRight).toBe(0)
  })
})
