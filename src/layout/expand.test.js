import { describe, it, expect } from 'vitest'
import { expandElements } from './expand.js'

function baseTpl (elements, ds2) {
  return {
    headerY: 50,
    summaryA: 300,
    summaryB: 400,
    footerY: 700,
    dataset: {
      ds1: { data: [{}] },
      ds2: { data: ds2 }
    },
    elements
  }
}

describe('expandElements group peer follow', () => {
  it('同组 text/空格跟随 ds 数组循环；合计组(无数组 peer)不跟随', () => {
    const gidData = 'd_0'
    const gidTotal = 'd_1'
    const tpl = baseTpl([
      { id: 'code', type: 'data', x: 0, y: 100, width: 40, height: 20, groupId: gidData, content: '${ds2.code}' },
      { id: 'blank', type: 'text', x: 40, y: 100, width: 40, height: 20, groupId: gidData, content: '' },
      { id: 'label', type: 'text', x: 80, y: 100, width: 40, height: 20, groupId: gidData, content: '备注' },
      { id: 'totalLbl', type: 'text', x: 0, y: 200, width: 40, height: 20, groupId: gidTotal, content: '合计' },
      { id: 'totalSum', type: 'data', x: 40, y: 200, width: 40, height: 20, groupId: gidTotal, content: '${sum(ds2.code)}' }
    ], [{ code: 'A' }, { code: 'B' }, { code: 'C' }])

    const { renderedElements } = expandElements(tpl)
    const idxOf = (id) => renderedElements.filter(e => e.original.id === id).map(e => e.index)

    expect(idxOf('code')).toEqual([0, 1, 2])
    expect(idxOf('blank')).toEqual([0, 1, 2])
    expect(idxOf('label')).toEqual([0, 1, 2])
    expect(renderedElements.filter(e => e.original.id === 'label').map(e => e.parsedContent)).toEqual(['备注', '备注', '备注'])
    expect(idxOf('totalLbl')).toEqual([0])
    expect(idxOf('totalSum')).toEqual([0])
  })

  it('无 groupId 的静态 text 不跟随邻格 ds 循环', () => {
    const tpl = baseTpl([
      { id: 'code', type: 'data', x: 0, y: 100, width: 40, height: 20, groupId: 'd_0', content: '${ds2.code}' },
      { id: 'orphan', type: 'text', x: 100, y: 100, width: 40, height: 20, groupId: null, content: 'X' }
    ], [{ code: 'A' }, { code: 'B' }])

    const { renderedElements } = expandElements(tpl)
    expect(renderedElements.filter(e => e.original.id === 'code')).toHaveLength(2)
    expect(renderedElements.filter(e => e.original.id === 'orphan')).toHaveLength(1)
  })

  it('纯 text 组(无任何数组绑定 peer)不循环', () => {
    const tpl = baseTpl([
      { id: 'code', type: 'data', x: 0, y: 100, width: 40, height: 25, groupId: 'd_0', content: '${ds2.code}' },
      { id: 'note', type: 'text', x: 40, y: 100, width: 40, height: 24, groupId: 'd_1', content: '' }
    ], [{ code: 'A' }, { code: 'B' }, { code: 'C' }])

    const { renderedElements } = expandElements(tpl)
    expect(renderedElements.filter(e => e.original.id === 'code')).toHaveLength(3)
    expect(renderedElements.filter(e => e.original.id === 'note')).toHaveLength(1)
  })
})
