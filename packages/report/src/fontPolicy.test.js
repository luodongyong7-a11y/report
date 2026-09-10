import { describe, expect, it } from 'vitest'
import {
  REPORT_DEFAULT_FONT_SIZE,
  REPORT_FONT_WHITELIST,
  composeFontFaceName,
  parseFontFaceName,
  fontKeyForFamily,
  fontSizeToPt,
  fontSizeToPx,
  formatFontSize,
  formatFontSizeInput,
  normalizeFontSizeCss,
  normalizeFontSizeStored,
  parseFontSize,
  resolveReportFontFamily,
  latinPostScriptFace,
  defaultMediaPaddingPx,
  resolveMediaPaddingPx,
  mapPdfFontFamily,
  mapPdfFontMeta
} from './fontPolicy.js'

describe('fontSize units', () => {
  it('parses pt, px and legacy bare numbers', () => {
    expect(parseFontSize('12pt')).toEqual({ value: 12, unit: 'pt' })
    expect(parseFontSize('16px')).toEqual({ value: 16, unit: 'px' })
    expect(parseFontSize(12)).toEqual({ value: 12, unit: 'px' })
    expect(parseFontSize('12')).toEqual({ value: 12, unit: 'px' })
  })

  it('converts between pt and css px at 96dpi', () => {
    expect(fontSizeToPx('9pt')).toBeCloseTo(12, 5)
    expect(fontSizeToPt(12)).toBeCloseTo(9, 5)
    expect(fontSizeToPt('16px')).toBeCloseTo(12, 5)
    expect(fontSizeToPx('12pt')).toBeCloseTo(16, 5)
  })

  it('stores canonical px by default', () => {
    expect(formatFontSize('12pt')).toBe('16px')
    expect(normalizeFontSizeStored(12)).toBe('12px')
    expect(normalizeFontSizeStored('16px')).toBe('16px')
    expect(normalizeFontSizeStored('9pt')).toBe('12px')
    expect(normalizeFontSizeStored('11pt')).toBe('14.67px')
    expect(normalizeFontSizeCss('9pt')).toBe('12px')
    expect(normalizeFontSizeCss(12)).toBe('12px')
    expect(REPORT_DEFAULT_FONT_SIZE).toBe('12px')
  })

  it('UI bare numbers assume pt when writing, store as px', () => {
    expect(formatFontSizeInput(9)).toBe('12px')
    expect(formatFontSizeInput('12')).toBe('16px')
    expect(formatFontSizeInput('16px')).toBe('16px')
    expect(formatFontSizeInput('11pt')).toBe('14.67px')
    // legacy parse still treats bare as px when formatting without assumeUnit path
    expect(formatFontSize(12)).toBe('12px')
    expect(formatFontSize(12, 'pt')).toBe('9pt')
  })

  it('can store as px when storeUnit is px', () => {
    expect(formatFontSizeInput('12', { assumeUnit: 'px', storeUnit: 'px' })).toBe('12px')
    expect(formatFontSizeInput('9pt', { assumeUnit: 'pt', storeUnit: 'px' })).toBe('12px')
    expect(formatFontSize('16px', 'px')).toBe('16px')
    expect(normalizeFontSizeStored('16px')).toBe('16px')
  })
})

describe('fontKeyForFamily', () => {
  it('maps whitelist families onto sidecar keys', () => {
    expect(fontKeyForFamily('')).toBe('times')
    expect(fontKeyForFamily('Times New Roman')).toBe('times')
    expect(fontKeyForFamily('Arial')).toBe('arial')
    expect(fontKeyForFamily('ArialMT')).toBe('arial')
    expect(fontKeyForFamily('Arial-BoldMT')).toBe('arial')
    expect(fontKeyForFamily('Helvetica')).toBe('arial')
    expect(fontKeyForFamily('Courier New')).toBe('courier')
    expect(fontKeyForFamily('Calibri')).toBe('calibri')
    expect(fontKeyForFamily('Cambria')).toBe('cambria')
    expect(fontKeyForFamily('Georgia')).toBe('georgia')
    expect(fontKeyForFamily('Verdana')).toBe('verdana')
    expect(fontKeyForFamily('Tahoma')).toBe('tahoma')
    expect(fontKeyForFamily('Segoe UI')).toBe('segoeui')
    expect(fontKeyForFamily('Trebuchet MS')).toBe('trebuchet')
    expect(fontKeyForFamily('Symbol')).toBe('pdfsymbol')
    expect(fontKeyForFamily('Wingdings')).toBe('dingbats')
    expect(fontKeyForFamily('Segoe UI Symbol')).toBe('symbol')
    expect(fontKeyForFamily('SimSun')).toBe('song')
    expect(fontKeyForFamily('宋体')).toBe('song')
    expect(fontKeyForFamily('SimHei')).toBe('hei')
    expect(fontKeyForFamily('黑体')).toBe('hei')
    expect(fontKeyForFamily('KaiTi')).toBe('kai')
    expect(fontKeyForFamily('楷体')).toBe('kai')
    expect(fontKeyForFamily('FangSong')).toBe('fang')
    expect(fontKeyForFamily('仿宋')).toBe('fang')
    expect(fontKeyForFamily('Microsoft YaHei')).toBe('yahei')
    expect(fontKeyForFamily('微软雅黑')).toBe('yahei')
    expect(fontKeyForFamily('Microsoft JhengHei')).toBe('jhenghei')
    expect(fontKeyForFamily('DengXian')).toBe('dengxian')
    expect(fontKeyForFamily('Calibri')).toBe('calibri')
    expect(fontKeyForFamily('Palatino Linotype')).toBe('palatino')
    expect(fontKeyForFamily('Century Gothic')).toBe('gothic')
    expect(fontKeyForFamily('Arial Black')).toBe('arialblack')
    expect(fontKeyForFamily('Arial Narrow')).toBe('arialnarrow')
    expect(fontKeyForFamily('Consolas')).toBe('consolas')
    expect(fontKeyForFamily('OCR-B')).toBe('ocrb')
    expect(fontKeyForFamily('OCR-A')).toBe('ocra')
  })
})

describe('REPORT_FONT_WHITELIST', () => {
  it('lists Arial first after auto so Target/Walmart tickets pick the TG-211 face', () => {
    expect(REPORT_FONT_WHITELIST[0].value).toBe('')
    expect(REPORT_FONT_WHITELIST[1]).toEqual({ value: 'Arial', labelKey: 'designer.toolbar.fontArial' })
    expect(REPORT_FONT_WHITELIST.filter((f) => f.value === 'Arial')).toHaveLength(1)
    expect(REPORT_FONT_WHITELIST.map((f) => f.value)).toEqual(expect.arrayContaining([
      'Arial Bold',
      'Arial Italic',
      'Arial Bold Italic',
      'Helvetica',
      'Helvetica Bold',
      'OCR-B',
      'OCR-A'
    ]))
  })

  it('parses named faces without treating Arial Black as Arial+bold', () => {
    expect(parseFontFaceName('Arial Bold')).toEqual({ family: 'Arial', weight: 'bold', style: 'normal' })
    expect(parseFontFaceName('Arial Bold Italic')).toEqual({ family: 'Arial', weight: 'bold', style: 'italic' })
    expect(parseFontFaceName('Arial Black')).toEqual({ family: 'Arial Black', weight: 'normal', style: 'normal' })
    expect(parseFontFaceName('Arial Narrow Bold')).toEqual({ family: 'Arial Narrow', weight: 'bold', style: 'normal' })
    expect(composeFontFaceName('Arial', 'bold', 'normal')).toBe('Arial Bold')
    expect(composeFontFaceName('Arial', 'normal', 'italic')).toBe('Arial Italic')
  })

  it('includes Adobe Base-14 peers and mainstream Windows faces', () => {
    const values = REPORT_FONT_WHITELIST.map((f) => f.value)
    expect(values).toEqual(expect.arrayContaining([
      '',
      'SimSun',
      'SimHei',
      'KaiTi',
      'FangSong',
      'Microsoft YaHei',
      'Microsoft JhengHei',
      'DengXian',
      'Palatino Linotype',
      'Century Gothic',
      'Arial Black',
      'Helvetica',
      'Times New Roman',
      'Courier New',
      'Symbol',
      'Wingdings',
      'Arial',
      'Calibri',
      'Cambria',
      'Georgia',
      'Verdana',
      'Tahoma',
      'Segoe UI',
      'Trebuchet MS',
      'Segoe UI Symbol'
    ]))
  })
})

describe('resolveReportFontFamily', () => {
  it('appends CJK fallback for a single family name', () => {
    expect(resolveReportFontFamily('Arial')).toContain('ArialMT')
    expect(resolveReportFontFamily('Arial')).toContain('Arial')
    expect(resolveReportFontFamily('Arial')).toContain('SimSun')
    expect(resolveReportFontFamily('Arial', 'bold')).toContain('Arial-BoldMT')
    expect(latinPostScriptFace('arial', 'bold')).toBe('Arial-BoldMT')
  })
})

describe('resolveMediaPaddingPx', () => {
  it('defaults barcode/qrcode 0 and image 3', () => {
    expect(defaultMediaPaddingPx('barcode')).toBe(0)
    expect(defaultMediaPaddingPx('qrcode')).toBe(0)
    expect(defaultMediaPaddingPx('image')).toBe(3)
    expect(resolveMediaPaddingPx({ type: 'barcode', width: 150, height: 37 })).toBe(0)
    expect(resolveMediaPaddingPx({ type: 'qrcode', width: 75, height: 75 })).toBe(0)
    expect(resolveMediaPaddingPx({ type: 'image', width: 75, height: 75 })).toBe(3)
  })

  it('honours explicit 0 and custom padding', () => {
    expect(resolveMediaPaddingPx({ type: 'qrcode', padding: 0, width: 75, height: 75 })).toBe(0)
    expect(resolveMediaPaddingPx({ type: 'qrcode', padding: 8, width: 75, height: 75 })).toBe(8)
  })

  it('clamps so the inner box stays at least 4px', () => {
    const pad = resolveMediaPaddingPx({ type: 'qrcode', padding: 100, width: 20, height: 20 })
    expect(pad).toBe((20 - 4) / 2)
  })
})

describe('mapPdfFontFamily', () => {
  it('maps Adobe commercial faces onto the whitelist', () => {
    expect(mapPdfFontFamily('MyriadPro-Bold')).toBe('Arial')
    expect(mapPdfFontMeta('MyriadPro-Bold')).toEqual({ family: 'Arial', weight: 'bold', style: 'normal' })
    expect(mapPdfFontFamily('MinionPro-Regular')).toBe('Times New Roman')
    expect(mapPdfFontFamily('CourierStd')).toBe('Courier New')
    expect(mapPdfFontFamily('AdobeSongStd-Light')).toBe('SimSun')
    expect(mapPdfFontFamily('STSong-Light')).toBe('SimSun')
    expect(mapPdfFontFamily('AdobeHeitiStd-Regular')).toBe('SimHei')
    expect(mapPdfFontFamily('AdobeGothicStd-Bold')).toBe('SimHei')
    expect(mapPdfFontFamily('AdobeKaitiStd-Regular')).toBe('KaiTi')
    expect(mapPdfFontFamily('Arial-BoldMT')).toBe('Arial')
    expect(mapPdfFontFamily('Helvetica')).toBe('Arial')
    expect(mapPdfFontFamily('Helvetica-Bold')).toBe('Arial')
    expect(mapPdfFontMeta('Arial-BoldMT').weight).toBe('bold')
    expect(mapPdfFontMeta('MinionPro-It').style).toBe('italic')
    expect(mapPdfFontMeta('MyriadPro-BoldIt')).toEqual({ family: 'Arial', weight: 'bold', style: 'italic' })
  })

  it('maps Windows faces instead of dumping them to Arial/SimHei', () => {
    expect(mapPdfFontFamily('Calibri')).toBe('Calibri')
    expect(mapPdfFontFamily('ABCDEF+Calibri-Bold')).toBe('Calibri')
    expect(mapPdfFontFamily('MicrosoftYaHei')).toBe('Microsoft YaHei')
    expect(mapPdfFontFamily('MicrosoftJhengHei')).toBe('Microsoft JhengHei')
    expect(mapPdfFontFamily('DengXian')).toBe('DengXian')
    expect(mapPdfFontFamily('CenturyGothic')).toBe('Century Gothic')
    expect(mapPdfFontFamily('PalatinoLinotype-Bold')).toBe('Palatino Linotype')
    expect(mapPdfFontFamily('ComicSansMS')).toBe('Comic Sans MS')
    expect(mapPdfFontFamily('Arial-Black')).toBe('Arial Black')
    expect(mapPdfFontMeta('Arial-Black').weight).toBe('normal')
    expect(mapPdfFontFamily('AdobeGothicStd-Bold')).toBe('SimHei')
  })
})
