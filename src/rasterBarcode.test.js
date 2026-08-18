import { describe, expect, it } from 'vitest'
import { encode, toRects } from '@niqer/barcode'
import {
  detectPdfBarcode,
  expandHriMatchBox,
  rasterBarcodePayload,
  rasterBarcodeReplace,
  scanBarcodeImage
} from './rasterBarcode.js'

function rasterize (symbol, module = 4, pad = 8) {
  const barH = module * 40
  const bodyW = symbol.modules.length * module
  const width = bodyW + pad * 2
  const height = barH + pad * 2
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  const rects = toRects(symbol, { module, height: barH, offsetX: pad, offsetY: pad })
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x))
    const y0 = Math.max(0, Math.floor(r.y))
    const x1 = Math.min(width, Math.ceil(r.x + r.w))
    const y1 = Math.min(height, Math.ceil(r.y + r.h))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * width + x) * 4
        data[p] = 0
        data[p + 1] = 0
        data[p + 2] = 0
      }
    }
  }
  return { data, width, height }
}

function upcPageLayout (upc = '191908755830', pageHeightPt = 288) {
  const packed = encode(upc, { format: 'upca' })
  const module = 2
  const barH = 80
  const x0 = 48
  const y0 = 80
  const rects = toRects(packed, { module, height: barH, offsetX: x0, offsetY: 0 })
  const paths = rects.map((r) => ({
    minX: r.x,
    minY: y0 + (barH - r.h),
    w: r.w,
    h: r.h,
    fill: '#000000'
  }))
  const textLines = [...upc].map((d, i) => ({
    content: d,
    xPt: x0 + 8 + i * 7,
    yTopPt: pageHeightPt - (y0 - 4),
    wPt: 6,
    hPt: 12
  }))
  return { pageHeightPt, paths, textLines }
}

describe('rasterBarcodePayload', () => {
  it('uses a retail UPC column when present', () => {
    expect(rasterBarcodePayload({ UPC: '191908755830', PO: '51150898' })).toEqual({
      content: '191908755830',
      format: 'upca'
    })
  })

  it('does not turn a match-key PO into Code 128', () => {
    expect(rasterBarcodePayload({ PO: '51150898' })).toBeNull()
  })
})

describe('expandHriMatchBox', () => {
  it('grows a short HRI strip upward to cover bars', () => {
    const box = expandHriMatchBox({ x: 23, y: 256, width: 342, height: 40 })
    expect(box.x).toBe(23)
    expect(box.width).toBe(342)
    expect(box.y).toBeLessThan(256)
    expect(box.height).toBeGreaterThan(40)
    expect(box.y + box.height).toBeGreaterThan(256)
  })

  it('keeps a tall box as-is', () => {
    const src = { x: 10, y: 40, width: 200, height: 160 }
    expect(expandHriMatchBox(src)).toEqual(src)
  })
})

describe('detectPdfBarcode', () => {
  it('reads UPC-A format and content from the PDF symbol', () => {
    const hit = detectPdfBarcode(upcPageLayout(), { x: 40, y: 180, width: 200, height: 36 })
    expect(hit.format).toBe('upca')
    expect(hit.content).toBe('191908755830')
  })

  it('returns null when the page has no barcode', () => {
    expect(detectPdfBarcode({ pageHeightPt: 288, paths: [], textLines: [] }, {
      x: 20,
      y: 80,
      width: 200,
      height: 36
    })).toBeNull()
  })

  it('does not guess Code 128 from an 8-digit HRI', () => {
    const paths = []
    for (let i = 0; i < 22; i++) {
      paths.push({ minX: 40 + i * 4, minY: 80, w: 1.2, h: 120, fill: '#000000' })
    }
    expect(detectPdfBarcode({
      pageHeightPt: 288,
      paths,
      textLines: [...'51151529'].map((d, i) => ({
        content: d,
        xPt: 50 + i * 12,
        yTopPt: 200,
        wPt: 8,
        hPt: 12
      }))
    }, { x: 40, y: 180, width: 200, height: 36 })).toBeNull()
  })
})

describe('scanBarcodeImage', () => {
  it('reads UPC-A format from a painted crop', () => {
    const img = rasterize(encode('191908755830', { format: 'upca' }))
    expect(scanBarcodeImage(img)).toEqual({
      format: 'upca',
      content: '191908755830',
      source: 'scan'
    })
  })

  it('scan result wins over a missing vector decode', () => {
    const spec = rasterBarcodeReplace(
      { pageHeightPt: 288, paths: [] },
      { x: 20, y: 80, width: 200, height: 80 },
      { PO: '51151529' },
      { format: 'upca', content: '191908755830', source: 'scan' }
    )
    expect(spec.format).toBe('upca')
    expect(spec.content).toBe('191908755830')
  })
})

describe('rasterBarcodeReplace', () => {
  it('keeps the PDF UPC-A instead of rewriting the PO as Code 128', () => {
    const spec = rasterBarcodeReplace(
      upcPageLayout(),
      { x: 40, y: 180, width: 200, height: 36 },
      { PO: '51151529' }
    )
    expect(spec.format).toBe('upca')
    expect(spec.content).toBe('191908755830')
    expect(spec.keepHri).toBe(true)
    expect(spec.element.barcodeFormat).toBe('upca')
    expect(spec.element.barcodeDisplayValue).toBe(false)
  })

  it('returns null when there is no PDF barcode to reprint', () => {
    expect(rasterBarcodeReplace(
      { pageHeightPt: 288, paths: [] },
      { x: 20, y: 200, width: 180, height: 36 },
      { PO: '51150898' }
    )).toBeNull()
  })
})
