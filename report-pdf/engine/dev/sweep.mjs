// 健壮性批量扫描:对 out/templates 下所有真实模板用 mock 数据渲染,统计成功/失败/页数,
// 找出会报错或异常的模板。mock 数据按元素绑定的 dsN.字段 自动生成。
import '../fonts.mjs'
import { renderTemplateToPdf } from '../render.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '..', 'out')
const TPL_DIR = path.join(OUT, 'templates')
const SWEEP_DIR = path.join(OUT, 'sweep')
fs.mkdirSync(SWEEP_DIR, { recursive: true })

const ROWS = Number(process.argv[2] || 15)
const NUMERIC_RE = /(qty|quantity|amount|price|total|dosage|count|num|weight|money|金额|数量|单价|总额|重量|价)/i
const LONG_RE = /(name|名称|desc|描述|spec|规格|remark|备注|model|型号|说明|address|地址)/i

// 从模板元素收集每个 dsN 引用到的字段
function collectFieldsByDs (template) {
  const map = {}
  const dsKeys = Object.keys(template.dataset || {}).filter(k => /^ds\d+$/i.test(k))
  for (const k of dsKeys) map[k] = new Set()
  const re = /\$\{([^}]+)\}/g
  for (const el of template.elements || []) {
    const content = el.content || ''
    let m
    while ((m = re.exec(content)) !== null) {
      const inner = m[1]
      const fieldRe = /(ds\d+)\.([a-zA-Z0-9_]+)/g
      let f
      while ((f = fieldRe.exec(inner)) !== null) {
        const ds = f[1]
        if (!map[ds]) map[ds] = new Set()
        map[ds].add(f[2])
      }
    }
    // 合并设置里的 dsN.field
    for (const key of ['mergeGroupBy', 'mergeSumField']) {
      const v = el[key]
      if (typeof v === 'string') {
        const mm = v.match(/(ds\d+)\.([a-zA-Z0-9_]+)/)
        if (mm) { if (!map[mm[1]]) map[mm[1]] = new Set(); map[mm[1]].add(mm[2]) }
      }
    }
  }
  return map
}

function mockValue (field, idx) {
  if (NUMERIC_RE.test(field)) return ((idx + 1) * 12.5).toFixed(2)
  if (LONG_RE.test(field)) return `示例${field} ${idx + 1} / Mẫu vật tư ${idx + 1} thép không gỉ`
  return `${field}_${idx + 1}`
}

function buildMockDataset (template) {
  const fieldsByDs = collectFieldsByDs(template)
  const dataset = {}
  for (const [ds, fields] of Object.entries(fieldsByDs)) {
    const fieldList = [...fields]
    const rows = []
    for (let i = 0; i < ROWS; i++) {
      const row = {}
      if (fieldList.length === 0) row._idx = i + 1
      for (const f of fieldList) row[f] = mockValue(f, i)
      rows.push(row)
    }
    dataset[ds] = rows
  }
  return dataset
}

const files = fs.readdirSync(TPL_DIR).filter(f => f.endsWith('.json'))
console.log(`扫描 ${files.length} 张模板(每 dsN ${ROWS} 行 mock)\n`)

const results = []
for (const file of files) {
  const name = file.replace(/\.json$/, '')
  try {
    const template = JSON.parse(fs.readFileSync(path.join(TPL_DIR, file), 'utf8'))
    template.dataset = buildMockDataset(template)
    const outPath = path.join(SWEEP_DIR, `${name}.pdf`)
    const res = await renderTemplateToPdf(template, outPath)
    results.push({ name, ok: true, pages: res.pageCount, els: res.elementCount, bytes: res.bytes })
  } catch (e) {
    results.push({ name, ok: false, err: (e && e.message) || String(e) })
  }
}

const okList = results.filter(r => r.ok)
const failList = results.filter(r => !r.ok)
console.log('结果:')
for (const r of results) {
  if (r.ok) console.log(`  OK    ${r.name.padEnd(40)} 页=${String(r.pages).padStart(2)} 元素=${String(r.els).padStart(4)} ${r.bytes}B`)
  else console.log(`  FAIL  ${r.name.padEnd(40)} ${r.err}`)
}
console.log(`\n成功 ${okList.length} / ${results.length},失败 ${failList.length}`)
if (failList.length > 0) console.log('失败模板:', failList.map(r => r.name).join(', '))
