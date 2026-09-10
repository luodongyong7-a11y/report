// 汇总B→页脚:与数据区同一套 group/prev(缺元数据时几何推断) + 每页紧跟数据底
import { buildFlowModel } from '../../../packages/report-core/src/layout/flow.js'

function measureCell (el, { autoGrow }) {
  const text = String(el.parsedContent || '')
  const lines = Math.max(1, text.split(/\n/).length + Math.floor(text.length / 20))
  const grown = lines * 16
  return { boxHeight: autoGrow ? Math.max(el.height || 0, grown) : (el.height || 0) }
}

const longRemark = '备注：' + '这是一段很长的备注内容需要完整显示。'.repeat(8)
const tpl = {
  paperSize: { width: 794, height: 1123 },
  headerY: 80,
  summaryA: 400,
  summaryB: 450,
  footerY: 1000,
  elements: [
    { id: 'd1', type: 'data', x: 40, y: 100, width: 200, height: 40, content: '${ds1.name}' },
    { id: 's1', type: 'text', x: 40, y: 410, width: 100, height: 24, content: '小计' },
    // 故意不写 groupId/prevNodeId,验证 ensureGroupAndPrevNode 推断
    { id: 'note', type: 'text', x: 40, y: 460, width: 400, height: 30, content: longRemark },
    { id: 'noteSide', type: 'text', x: 450, y: 460, width: 80, height: 30, content: '侧' },
    { id: 'sign', type: 'text', x: 40, y: 520, width: 100, height: 24, content: '签章' },
    { id: 'f1', type: 'text', x: 40, y: 1020, width: 100, height: 20, content: '页脚' }
  ],
  dataset: {
    ds1: Array.from({ length: 40 }, (_, i) => ({ name: 'R' + i }))
  }
}

const model = buildFlowModel(tpl, { measureCell })
console.log('totalPages', model.totalPages)

let coveredDataPages = 0
const dataPageCount = model.pages.filter(p => p.rows.some(r => r.band === 'detail')).length
for (let i = 0; i < model.pages.length; i++) {
  const pg = model.pages[i]
  const sbf = pg.rows.filter(r => r.band === 'summaryBToFooter')
  const detail = pg.rows.filter(r => r.band === 'detail')
  if (sbf.length) {
    const noteRow = sbf.find(r => r.cells.some(c => c.original.id === 'note'))
    const signRow = sbf.find(r => r.cells.some(c => c.original.id === 'sign'))
    if (!noteRow || !signRow) throw new Error('page ' + pg.pageIndex + ' missing note/sign')
    const noteCell = noteRow.cells.find(c => c.original.id === 'note')
    const sideCell = noteRow.cells.find(c => c.original.id === 'noteSide')
    if (noteCell.ownHeight <= 30) throw new Error('note should autoGrow')
    if (!sideCell || sideCell.ownHeight !== noteCell.ownHeight) {
      throw new Error('group equalize failed')
    }
    if (signRow.top < noteRow.top + noteRow.height) {
      throw new Error('sign overlapped note via prevNode')
    }
    console.log('page', pg.pageIndex, {
      detail: detail.length,
      sbfRows: sbf.length,
      noteH: noteCell.ownHeight,
      signTop: signRow.top,
      noteBottom: noteRow.top + noteRow.height
    })
  }
  if (!detail.length) continue
  // 每页数据后都必须同页带有 SBF(分页时已预留高度,禁止整带挪到下一页)
  if (!sbf.length) throw new Error('data page ' + pg.pageIndex + ' missing same-page SBF')
  coveredDataPages++
}

if (coveredDataPages !== dataPageCount) {
  throw new Error(`SBF cover mismatch: dataPages=${dataPageCount} covered=${coveredDataPages}`)
}
console.log('OK: sbf group/prev like detail, repeat after each data page')
