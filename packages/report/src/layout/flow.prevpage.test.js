import { describe, it, expect } from 'vitest'
import { buildFlowModel } from './flow.js'

/** 构造精简双表:变更前/后各一段,尾部交期挂在后表明细 prev 上。 */
function makeDualTableTpl ({ beforeRows, afterRows }) {
  const headerY = 100
  const summaryA = 900
  const footerY = 1000
  const beforeTitle = { id: 'bt', type: 'text', x: 0, y: 100, width: 200, height: 20, content: '变更前', prevNodeId: null }
  const beforeHead = { id: 'bh', type: 'text', x: 0, y: 120, width: 100, height: 20, content: '序号', prevNodeId: 'bt' }
  const beforeCell = {
    id: 'bc', type: 'data', x: 0, y: 140, width: 100, height: 30,
    content: '${ds3.code}', prevNodeId: 'bh,bt'
  }
  const afterTitle = {
    id: 'at', type: 'text', x: 0, y: 200, width: 200, height: 20,
    content: '变更后', prevNodeId: 'bc,bh,bt'
  }
  const afterHead = {
    id: 'ah', type: 'text', x: 0, y: 220, width: 100, height: 20,
    content: '序号', prevNodeId: 'at,bc,bh,bt'
  }
  const afterCell = {
    id: 'ac', type: 'data', x: 0, y: 240, width: 100, height: 30,
    content: '${ds2.code}', prevNodeId: 'ah,at,bc,bh,bt'
  }
  // 故意把表头也写进 prev:多页时页内 top 可能大于后页明细 bottom 数值
  const afterDate = {
    id: 'ad', type: 'data', x: 0, y: 280, width: 200, height: 20,
    content: '订单交期:${ds1.delivery_date}',
    prevNodeId: 'ac,ah,at,bc,bh,bt'
  }
  const afterRemark = {
    id: 'ar', type: 'text', x: 0, y: 300, width: 200, height: 20,
    content: '备注:${ds1.remark}',
    prevNodeId: 'ad,ac,ah,at,bc,bh,bt'
  }

  return {
    headerY,
    summaryA,
    summaryB: summaryA,
    footerY,
    paperSize: { width: 400, height: 1123 },
    dataset: {
      ds1: { delivery_date: '2026-02-01', remark: 'after' },
      ds3: Array.from({ length: beforeRows }, (_, i) => ({ code: 'B' + i })),
      ds2: Array.from({ length: afterRows }, (_, i) => ({ code: 'A' + i }))
    },
    elements: [beforeTitle, beforeHead, beforeCell, afterTitle, afterHead, afterCell, afterDate, afterRemark]
  }
}

describe('buildFlowModel orderChange-like prev cascade', () => {
  it('变更后交期/备注跟随 ds2 末页,不因跨页 top 数值挂回首页表头', () => {
    const tpl = makeDualTableTpl({ beforeRows: 20, afterRows: 20 })
    const model = buildFlowModel(tpl, { measureCell: (el) => ({ boxHeight: el.height || 20 }) })
    expect(model.totalPages).toBeGreaterThan(1)

    const locate = (id) => {
      for (const page of model.pages) {
        for (const row of page.rows || []) {
          for (const c of row.cells || []) {
            if (c.original?.id === id) return { page: page.pageIndex, top: row.top }
          }
        }
      }
      return null
    }

    let ds2LastPage = -1
    for (const page of model.pages) {
      for (const row of page.rows || []) {
        if (row.cells.some(c => c.original?.id === 'ac')) ds2LastPage = page.pageIndex
      }
    }

    const date = locate('ad')
    const remark = locate('ar')
    expect(date).toBeTruthy()
    expect(remark).toBeTruthy()
    expect(date.page).toBe(ds2LastPage)
    expect(remark.page).toBe(ds2LastPage)
    expect(remark.top).toBeGreaterThanOrEqual(date.top)
  })
})
