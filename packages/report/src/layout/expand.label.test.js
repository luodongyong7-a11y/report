import { describe, it, expect } from 'vitest'
import { expandElements } from './expand.js'
import { isLabelPrintKind } from './printKind.js'

describe('isLabelPrintKind', () => {
  it('only true when printKind is label', () => {
    expect(isLabelPrintKind({})).toBe(false)
    expect(isLabelPrintKind({ printKind: 'document' })).toBe(false)
    expect(isLabelPrintKind({ printKind: 'label' })).toBe(true)
  })
})

describe('expandElements printKind=label', () => {
  const headerY = 384
  const labelTpl = (rows, extraEls = []) => ({
    printKind: 'label',
    headerY,
    footerY: headerY,
    summaryEnabled: false,
    paperSize: { width: 384, height: 384 },
    dataset: {
      ds1: rows,
      param: {}
    },
    elements: [
      {
        id: 'code',
        type: 'data',
        x: 10,
        y: 8,
        width: 80,
        height: 16,
        content: '${ds1.code}'
      },
      {
        id: 'title',
        type: 'text',
        x: 10,
        y: 40,
        width: 120,
        height: 16,
        content: 'DPCI'
      },
      ...extraEls
    ]
  })

  it('clones every element per dataset row, including header-band Y', () => {
    const { renderedElements } = expandElements(labelTpl([
      { code: 'A' },
      { code: 'B' }
    ]))
    const codes = renderedElements.filter(e => e.original.id === 'code')
    const titles = renderedElements.filter(e => e.original.id === 'title')
    expect(codes.map(e => e.index)).toEqual([0, 1])
    expect(codes.map(e => e.parsedContent)).toEqual(['A', 'B'])
    expect(titles).toHaveLength(2)
    expect(titles.map(e => e.parsedContent)).toEqual(['DPCI', 'DPCI'])
    expect(codes.every(e => e.inDataArea === false)).toBe(true)
  })

  it('empty array yields no instances', () => {
    const { renderedElements } = expandElements(labelTpl([]))
    expect(renderedElements).toHaveLength(0)
  })

  it('no array binding yields one static page', () => {
    const { renderedElements } = expandElements({
      printKind: 'label',
      headerY,
      dataset: { param: {} },
      elements: [
        { id: 't', type: 'text', x: 0, y: 0, width: 40, height: 16, content: 'HI' }
      ]
    })
    expect(renderedElements).toHaveLength(1)
    expect(renderedElements[0].parsedContent).toBe('HI')
  })

  it('document mode still does not iterate header-band fields', () => {
    const { renderedElements } = expandElements({
      headerY: 50,
      summaryA: 300,
      summaryB: 400,
      footerY: 700,
      dataset: { ds1: [{ code: 'A' }, { code: 'B' }] },
      elements: [
        { id: 'h', type: 'data', x: 0, y: 10, width: 40, height: 16, content: '${ds1.code}' }
      ]
    })
    expect(renderedElements.filter(e => e.original.id === 'h')).toHaveLength(1)
  })

  it('resolves Excel datasets whose variable is not dsN', () => {
    const { renderedElements } = expandElements({
      printKind: 'label',
      headerY,
      footerY: headerY,
      summaryEnabled: false,
      paperSize: { width: 384, height: 384 },
      dataset: {
        JY202606040200: {
          name: '订单',
          type: 'EXCEL',
          fields: ['PO'],
          data: [{ PO: '51151529' }, { PO: '51151527' }]
        },
        param: {}
      },
      elements: [
        {
          id: 'bc',
          type: 'barcode',
          x: 0,
          y: 0,
          width: 200,
          height: 80,
          content: '${JY202606040200.PO}',
          barcodeFormat: 'upca'
        }
      ]
    })
    expect(renderedElements.filter((e) => e.original.id === 'bc').map((e) => e.parsedContent))
      .toEqual(['51151529', '51151527'])
  })
})
