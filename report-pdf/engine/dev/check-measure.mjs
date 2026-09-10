// 基座自检:行高比率 + 几个单元格测高(对照 spike run.mjs 的口径)
import { LINE_HEIGHT_RATIO } from '../metrics.mjs'
import { measureCell } from '../measure.mjs'

console.log('LINE_HEIGHT_RATIO:', JSON.stringify(LINE_HEIGHT_RATIO))
console.log('  Times normal@12 =', (LINE_HEIGHT_RATIO.times * 12).toFixed(2), 'px')
console.log('  SimSun normal@12 =', (LINE_HEIGHT_RATIO.song * 12).toFixed(2), 'px')

const cases = [
  { label: '中文换行', el: { type: 'data', width: 120, height: 22, parsedContent: '不锈钢内六角螺栓规格说明与备注信息含表面处理要求', border: { width: 1 } } },
  { label: '越南文换行', el: { type: 'data', width: 120, height: 22, parsedContent: 'Phiếu xuất kho nguyên vật liệu cho đơn hàng số 2026-0001', border: { width: 1 } } },
  { label: '混排', el: { type: 'data', width: 260, height: 22, parsedContent: '不锈钢内六角螺栓 M8x40 镀锌 / Bu lông lục giác chìm thép không gỉ', border: { width: 1 } } },
  { label: '显式换行', el: { type: 'data', width: 200, height: 22, parsedContent: '第一行\n第二行\n第三行', border: { width: 1 } } },
  { label: '单行短', el: { type: 'data', width: 120, height: 22, parsedContent: '物料', border: { width: 1 } } }
]

console.log('\n单元格测高(autoGrow):')
for (const c of cases) {
  const m = measureCell(c.el, { autoGrow: true })
  console.log(`  ${c.label.padEnd(8)} 行数=${m.lines.length} 内容高=${m.contentHeight.toFixed(2)} 盒高=${m.boxHeight.toFixed(2)}`)
}
