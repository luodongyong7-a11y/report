import { describe, it, expect } from 'vitest'
import { buildFlowModel } from './flow.js'

describe('buildFlowModel summary vs detail border stack', () => {
  it('汇总带相对设计数据底边定位,保留模板 1px 叠盒', () => {
    // 数据底 201、汇总A线 200、小计 y=200 → 设计叠 1px;布局须再现该叠盒供边框合并
    const tpl = {
      headerY: 100,
      summaryA: 200,
      summaryB: 225,
      footerY: 800,
      paperSize: { width: 400, height: 1123 },
      dataset: {
        ds1: { data: [{}] },
        ds2: { data: [{ code: 'A' }, { code: 'B' }] }
      },
      elements: [
        {
          id: 'd', type: 'data', x: 0, y: 176, width: 100, height: 25,
          content: '${ds2.code}', border: { width: 1 }, prevNodeId: null
        },
        {
          id: 's', type: 'text', x: 0, y: 200, width: 100, height: 25,
          content: '小计', border: { width: 1 }, prevNodeId: null
        }
      ]
    }
    const model = buildFlowModel(tpl, { measureCell: (el) => ({ boxHeight: el.height || 25 }) })
    const page = model.pages[0]
    const details = page.rows.filter(r => r.band === 'detail')
    const sums = page.rows.filter(r => r.band === 'summary')
    expect(details.length).toBeGreaterThan(0)
    expect(sums.length).toBe(1)
    const lastD = details[details.length - 1]
    const sum = sums[0]
    const overlap = (lastD.top + lastD.height) - sum.top
    expect(overlap).toBe(1)
  })
})
