// 校验 formatType=number/date 导出为 Excel 原生类型,而非富文本。
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {
  excelDateNumFmtForElement,
  excelNumFmtForElement,
  resolveExcelTypedValue
} from '../draw-xlsx-flow.mjs'

function cell (content, original) {
  return { content, parsedContent: content, original }
}

{
  const t = resolveExcelTypedValue(cell('1234.5', { formatType: 'number', numberFormat: 'default', decimalPlaces: '2' }))
  assert.equal(t.value, 1234.5)
  assert.equal(t.numFmt, '0.00')
}

{
  const t = resolveExcelTypedValue(cell('¥1,234.56', {
    formatType: 'number',
    numberFormat: 'currency',
    currencySymbol: '¥',
    useGrouping: true
  }))
  assert.equal(t.value, 1234.56)
  assert.equal(t.numFmt, '"¥"#,##0.00')
}

{
  const t = resolveExcelTypedValue(cell('12.50%', { formatType: 'number', numberFormat: 'percent' }))
  assert.ok(Math.abs(t.value - 0.125) < 1e-9)
  assert.equal(t.numFmt, '0.00%')
}

{
  const t = resolveExcelTypedValue(cell('2024-01-15', { formatType: 'date', dateFormat: 'yyyy-MM-dd' }))
  assert.ok(t.value instanceof Date)
  assert.equal(t.value.getUTCFullYear(), 2024)
  assert.equal(t.value.getUTCMonth(), 0)
  assert.equal(t.value.getUTCDate(), 15)
  assert.equal(t.numFmt, 'yyyy-mm-dd')
}

{
  const t = resolveExcelTypedValue(cell('2024年03月08日', { formatType: 'date', dateFormat: 'yyyy年MM月dd日' }))
  assert.equal(t.value.getUTCDate(), 8)
  assert.equal(t.numFmt, 'yyyy"年"mm"月"dd"日"')
}

{
  const t = resolveExcelTypedValue(cell('03/08/2024', { formatType: 'date', dateFormat: 'MM/dd/yyyy' }))
  assert.equal(t.value.getUTCMonth(), 2)
  assert.equal(t.value.getUTCDate(), 8)
  assert.equal(t.numFmt, 'mm/dd/yyyy')
}

{
  const t = resolveExcelTypedValue(cell('2024-01-15 13:45:06', {
    formatType: 'date',
    dateFormat: 'yyyy-MM-dd HH:mm:ss'
  }))
  assert.equal(t.value.getUTCHours(), 13)
  assert.equal(t.value.getUTCMinutes(), 45)
  assert.equal(t.numFmt, 'yyyy-mm-dd hh:mm:ss')
}

{
  // 序号 / 合计等计算函数：即使未设 formatType 也写成数字
  const rowNo = resolveExcelTypedValue(cell('3', { content: '${row(ds1)}' }))
  assert.equal(rowNo.value, 3)
  assert.equal(rowNo.numFmt, 'General')
  const sum = resolveExcelTypedValue(cell('120.5', { content: '${sum(ds1.qty)}' }))
  assert.equal(sum.value, 120.5)
  const page = resolveExcelTypedValue(cell('2', { content: '${page}' }))
  assert.equal(page.value, 2)
  const mergeSum = resolveExcelTypedValue(cell('10', { mergeMode: 'sum', content: '${ds1.qty}' }))
  assert.equal(mergeSum.value, 10)

  // 普通字段未设 formatType：即使长得像数字也保持文本
  assert.equal(resolveExcelTypedValue(cell('1234.5', { content: '${ds1.code}' })), null)
  assert.equal(resolveExcelTypedValue(cell('00123', {})), null)
  assert.equal(resolveExcelTypedValue(cell('备注', { formatType: 'number' })), null)
  assert.equal(resolveExcelTypedValue(cell('12\n34', { formatType: 'number' })), null)
  assert.equal(resolveExcelTypedValue(cell('not-a-date', { formatType: 'date' })), null)
}

assert.equal(excelNumFmtForElement({ numberFormat: 'default' }), 'General')
assert.equal(excelNumFmtForElement({ numberFormat: 'default', decimalPlaces: '0' }), '0')
assert.equal(excelNumFmtForElement({ numberFormat: 'fixed2' }), '0.00')
assert.equal(excelDateNumFmtForElement({ dateFormat: 'yyyy/MM/dd' }), 'yyyy/mm/dd')

// Round-trip: typed Date survives ExcelJS write/read as a Date (not a string).
{
  const typed = resolveExcelTypedValue(cell('2024-01-15', { formatType: 'date', dateFormat: 'yyyy-MM-dd' }))
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('t')
  const c = ws.getCell(1, 1)
  c.value = typed.value
  c.numFmt = typed.numFmt
  const buf = await wb.xlsx.writeBuffer()
  const wb2 = new ExcelJS.Workbook()
  await wb2.xlsx.load(buf)
  const v = wb2.getWorksheet('t').getCell(1, 1).value
  assert.ok(v instanceof Date, `expected Date, got ${typeof v}`)
  assert.equal(v.getUTCFullYear(), 2024)
  assert.equal(v.getUTCMonth(), 0)
  assert.equal(v.getUTCDate(), 15)
}

console.log('test-xlsx-types: ok')