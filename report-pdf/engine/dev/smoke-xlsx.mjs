// 端到端冒烟(Excel):复用 smoke.mjs 落盘的同一份「物料领用单」模板 JSON,
// 用与 PDF 完全相同的布局产物生成 xlsx,再回读校验结构(工作表/合并/分页符/图片/行列)。
// 先跑 `node engine/smoke.mjs [行数]` 生成模板与 PDF,再跑本脚本对照。
import '../fonts.mjs'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { renderTemplateToXlsx } from '../render.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', '..', 'out')
const tplPath = path.join(OUT_DIR, 'engine-sample-template.json')

if (!fs.existsSync(tplPath)) {
  console.error(`缺少模板 ${tplPath},请先运行: node engine/smoke.mjs`)
  process.exit(1)
}

const templateData = JSON.parse(fs.readFileSync(tplPath, 'utf8'))
const outPath = path.join(OUT_DIR, 'engine-sample.xlsx')

const res = await renderTemplateToXlsx(templateData, outPath)
console.log(`展开元素实例数: ${res.elementCount}`)
console.log(`页数(与 PDF 同源): ${res.pageCount}  (totalPages=${res.totalPages})`)
console.log(`输出: ${res.outPath}  (${res.bytes} bytes)`)

// ---- 回读校验:确认文件可被 exceljs 正常解析,并统计关键结构 ----
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(outPath)
const ws = wb.getWorksheet('report')
if (!ws) { console.error('回读失败:未找到 report 工作表'); process.exit(2) }

const merges = ws.model.merges ? ws.model.merges.length : (ws._merges ? Object.keys(ws._merges).length : 0)
const images = (ws.getImages ? ws.getImages() : []).length

// exceljs 回读不还原 rowBreaks,直接解压 xlsx 读 sheet XML 数 brk(真实反映写入结果)。
const zip = await JSZip.loadAsync(fs.readFileSync(outPath))
let sheetXml = ''
for (const name of Object.keys(zip.files)) {
  if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) { sheetXml = await zip.files[name].async('string'); break }
}
const rowBreaks = (sheetXml.match(/<brk\b/g) || []).length

console.log('--- 回读校验 ---')
console.log(`工作表: ${wb.worksheets.map(w => w.name).join(', ')}`)
console.log(`行数(实际): ${ws.actualRowCount}  列数(实际): ${ws.actualColumnCount}`)
console.log(`合并区数量: ${merges}`)
console.log(`手动分页符数量: ${rowBreaks}  (期望 = 页数-1 = ${res.pageCount - 1})`)
console.log(`嵌入图片数量: ${images}  (条码+二维码,每页重复)`)
console.log(`页面设置: paperSize=${ws.pageSetup.paperSize} orientation=${ws.pageSetup.orientation} fitToWidth=${ws.pageSetup.fitToWidth} margins.left=${ws.pageSetup.margins && ws.pageSetup.margins.left}`)

// 抽样:找一个含「合计」的单元格,确认文本与硬换行写入正常
let sampleText = null
ws.eachRow({ includeEmpty: false }, (row) => {
  row.eachCell({ includeEmpty: false }, (cell) => {
    const v = typeof cell.value === 'string' ? cell.value : (cell.value && cell.value.richText ? cell.value.richText.map(r => r.text).join('') : '')
    if (!sampleText && v && v.includes('合计')) sampleText = v
  })
})
console.log('抽样单元格(含"合计"):', JSON.stringify(sampleText))

const brkOk = rowBreaks === res.pageCount - 1
console.log(brkOk ? 'OK: 分页符数量与页数一致' : '警告: 分页符数量与页数不一致')
