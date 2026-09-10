import { describe, expect, it } from 'vitest'
import { buildFlowModel } from './flow.js'

describe('buildFlowModel summaryEnabled=false', () => {
  it('treats whole page as content; no summary band reservation', () => {
    const tpl = {
      summaryEnabled: false,
      headerY: 0,
      footerY: 384,
      summaryA: 200,
      summaryB: 250,
      paperSize: { width: 384, height: 384 },
      dataset: { param: {} },
      elements: [
        {
          id: 't1',
          type: 'text',
          x: 10,
          y: 20,
          width: 200,
          height: 24,
          content: 'DPCI',
          prevNodeId: null,
        },
        {
          id: 't2',
          type: 'text',
          x: 10,
          y: 300,
          width: 200,
          height: 24,
          content: 'PO#',
          prevNodeId: null,
        },
      ],
    }

    const model = buildFlowModel(tpl, {
      measureCell: () => ({ boxHeight: 24 }),
    })

    expect(model.totalPages).toBe(1)
    const bands = []
    for (const row of model.pages[0].rows || []) {
      bands.push(row.band)
    }
    expect(bands).not.toContain('summary')
    expect(bands).not.toContain('sbf')
    const texts = []
    for (const row of model.pages[0].rows || []) {
      for (const cell of row.cells || []) {
        if (cell.content) texts.push(String(cell.content))
      }
    }
    expect(texts.join('|')).toMatch(/DPCI/)
    expect(texts.join('|')).toMatch(/PO#/)
  })
})
