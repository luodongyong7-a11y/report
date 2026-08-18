import { describe, it, expect } from 'vitest'
import { buildFlowModel } from './flow.js'

describe('buildFlowModel printKind=label', () => {
  const measureCell = (el) => ({ boxHeight: el.height || 16 })

  const labelTpl = (rows) => ({
    printKind: 'label',
    summaryEnabled: false,
    headerY: 384,
    footerY: 384,
    paperSize: { width: 384, height: 384 },
    dataset: {
      ds1: rows,
      param: {}
    },
    elements: [
      {
        id: 'code',
        type: 'data',
        x: 12,
        y: 20,
        width: 100,
        height: 18,
        content: '${ds1.code}',
        prevNodeId: null
      },
      {
        id: 'barcode',
        type: 'barcode',
        x: 12,
        y: 80,
        width: 200,
        height: 60,
        content: '${ds1.code}',
        prevNodeId: null
      },
      {
        id: 'pg',
        type: 'text',
        x: 12,
        y: 350,
        width: 80,
        height: 14,
        content: '${page}/${total}',
        prevNodeId: null
      }
    ]
  })

  it('one dataset row becomes one page; elements keep design Y (not stacked)', () => {
    const model = buildFlowModel(
      labelTpl([{ code: 'A' }, { code: 'B' }, { code: 'C' }]),
      { measureCell }
    )
    expect(model.totalPages).toBe(3)
    expect(model.pages).toHaveLength(3)

    const page0 = model.pages[0]
    const yById = {}
    const textById = {}
    for (const row of page0.rows) {
      for (const cell of row.cells) {
        yById[cell.original.id] = row.top
        textById[cell.original.id] = cell.content
      }
    }
    expect(yById.code).toBe(20)
    expect(yById.barcode).toBe(80)
    expect(textById.code).toBe('A')

    const page2code = []
    for (const row of model.pages[2].rows) {
      for (const cell of row.cells) {
        if (cell.original.id === 'code') page2code.push(cell.content)
      }
    }
    expect(page2code).toEqual(['C'])
  })

  it('empty dataset yields 0 pages', () => {
    const model = buildFlowModel(labelTpl([]), { measureCell })
    expect(model.totalPages).toBe(0)
    expect(model.pages).toHaveLength(0)
  })

  it('replaces ${page}/${total} with label page numbers', () => {
    const model = buildFlowModel(
      labelTpl([{ code: 'A' }, { code: 'B' }]),
      { measureCell }
    )
    const texts = []
    for (const row of model.pages[0].rows) {
      for (const cell of row.cells) {
        if (cell.original.id === 'pg') texts.push(cell.content)
      }
    }
    expect(texts[0]).toBe('1/2')
  })

  it('stamps one EPC per label page when rfid is enabled', () => {
    const model = buildFlowModel({
      ...labelTpl([{ code: 'A', PO: 'A' }, { code: 'B', PO: 'B' }]),
      rfid: {
        enabled: true,
        prefix: 'X',
        expression: '${prefix}${PO}${seq}',
        seqStart: 1,
        seqPad: 3,
        seqScope: 'order',
        writeFormat: 'hex'
      }
    }, { measureCell })
    expect(model.pages[0].epc).toMatch(/^[0-9A-F]+$/)
    expect(model.pages[1].epc).toMatch(/^[0-9A-F]+$/)
    expect(model.pages[0].epc).not.toBe(model.pages[1].epc)
  })

  it('does not autoGrow: barcode height stays design height', () => {
    const model = buildFlowModel(
      labelTpl([{ code: 'A' }]),
      { measureCell: () => ({ boxHeight: 999 }) }
    )
    let barcodeH = null
    for (const row of model.pages[0].rows) {
      for (const cell of row.cells) {
        if (cell.original.id === 'barcode') barcodeH = cell.ownHeight
      }
    }
    expect(barcodeH).toBe(60)
  })
})
