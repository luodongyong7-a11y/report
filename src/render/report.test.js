import { describe, expect, it } from 'vitest'
import { defineReportElement, layoutReport, reportToHtml, reportToPdf, REPORT_TAG } from '../index.js'

const docTpl = {
  printKind: 'document',
  paperSize: { width: 400, height: 300 },
  headerY: 40,
  summaryA: 220,
  summaryB: 250,
  footerY: 270,
  elements: [
    { id: 'h', type: 'text', x: 10, y: 8, width: 380, height: 24, content: '订单' },
    { id: 'n', type: 'text', x: 10, y: 50, width: 180, height: 22, content: '${ds1.name}', groupId: 'g1' },
    { id: 'q', type: 'text', x: 200, y: 50, width: 80, height: 22, content: '${ds1.qty}', groupId: 'g1' },
    { id: 's', type: 'text', x: 10, y: 230, width: 180, height: 20, content: '合计 ${sum(ds1.qty)}' },
    { id: 'f', type: 'text', x: 10, y: 276, width: 180, height: 18, content: '${page}/${total}' }
  ],
  dataset: {
    ds1: {
      type: 'EXCEL',
      data: [
        { name: 'A', qty: 2 },
        { name: 'B', qty: 3 }
      ]
    }
  }
}

const labelTpl = {
  printKind: 'label',
  paperSize: { width: 200, height: 80 },
  elements: [
    { id: 't', type: 'text', x: 8, y: 8, width: 184, height: 20, content: '${ds1.sku}' },
    { id: 'b', type: 'barcode', x: 8, y: 32, width: 184, height: 40, content: '${ds1.upc}', barcodeFormat: 'code128' }
  ],
  dataset: {
    ds1: {
      type: 'EXCEL',
      data: [
        { sku: 'SKU-1', upc: '123456' },
        { sku: 'SKU-2', upc: '654321' }
      ]
    }
  }
}

describe('niqer-report', () => {
  it('registers the custom element tag', () => {
    expect(defineReportElement()).toBe('niqer-report')
    expect(REPORT_TAG).toBe('niqer-report')
  })

  it('layouts a document with detail rows and sum', () => {
    const laid = layoutReport(docTpl)
    expect(laid.pages.length).toBeGreaterThanOrEqual(1)
    const texts = laid.pages.flatMap((p) => p.elements.map((e) => String(e.parsedContent || '')))
    expect(texts.some((t) => t.includes('A'))).toBe(true)
    expect(texts.some((t) => t.includes('B'))).toBe(true)
    expect(texts.some((t) => t.includes('5'))).toBe(true)
  })

  it('layouts one label page per dataset row', () => {
    const laid = layoutReport(labelTpl)
    expect(laid.pages.length).toBe(2)
    expect(laid.pages[0].elements.some((e) => String(e.parsedContent).includes('SKU-1'))).toBe(true)
    expect(laid.pages[1].elements.some((e) => String(e.parsedContent).includes('SKU-2'))).toBe(true)
  })

  it('writes HTML and PDF bytes', () => {
    const html = reportToHtml(labelTpl)
    expect(html).toContain('niqer-report-page')
    expect(html).toContain('SKU-1')
    const pdf = reportToPdf(labelTpl)
    expect(pdf).toBeInstanceOf(Uint8Array)
    expect(String.fromCharCode(pdf[0], pdf[1], pdf[2], pdf[3])).toBe('%PDF')
  })
})
