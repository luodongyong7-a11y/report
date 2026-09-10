import { describe, it, expect } from 'vitest'
import { buildFlowModel } from './flow.js'

function makeTpl (rows, stream) {
  return {
    headerY: 40,
    footerY: 780,
    paperSize: { width: 595, height: 842 },
    stream,
    dataset: {
      ds1: rows,
      param: {},
    },
    elements: [
      {
        id: 'h1',
        type: 'text',
        x: 0,
        y: 10,
        width: 200,
        height: 20,
        content: '第 ${page} / 共 ${total} 页',
        prevNodeId: null,
      },
      {
        id: 'sum1',
        type: 'text',
        x: 220,
        y: 10,
        width: 120,
        height: 20,
        content: '合计:${sum(ds1.qty)}',
        prevNodeId: null,
      },
      {
        id: 'd1',
        type: 'data',
        x: 0,
        y: 50,
        width: 100,
        height: 24,
        content: '${ds1.code}',
        prevNodeId: 'h1',
      },
      {
        id: 'd2',
        type: 'data',
        x: 120,
        y: 50,
        width: 80,
        height: 24,
        content: '${ds1.qty}',
        prevNodeId: 'h1',
      },
    ],
  }
}

describe('buildFlowModel stream fidelity hooks', () => {
  it('uses pageOffset / forcedTotalPages / forcedSums instead of batch-local values', () => {
    const model = buildFlowModel(
      makeTpl(
        [{ code: 'A', qty: 1 }, { code: 'B', qty: 2 }],
        {
          pageOffset: 10,
          forcedTotalPages: 42,
          forcedSums: { 'ds1.qty': 999 },
        }
      ),
      {
        measureCell: () => ({ width: 80, height: 24 }),
      }
    )

    expect(model.totalPages).toBeGreaterThanOrEqual(1)
    const firstPageText = []
    for (const row of model.pages[0].rows || []) {
      for (const cell of row.cells || []) {
        if (cell.content) firstPageText.push(String(cell.content))
      }
    }
    const joined = firstPageText.join('|')
    expect(joined).toMatch(/11/)
    expect(joined).toMatch(/42/)
    expect(joined).toMatch(/999/)
  })
})
