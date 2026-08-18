/**
 * Print-data jobs: customer PDF + imported rows. Match page text / filename to a
 * key field, expand copies, RFID payload, and per-line sample/production billing.
 */
import { getIterationArrayPath } from './expressions.js'
import { createRfidConfig, evaluateRfid, padSeq } from './rfid.js'
import { expandUpcE } from './upcAdobe.js'
import {
  detectPdfBarcode,
  expandHriMatchBox,
  findPdfBarcodeRegion,
  rasterBarcodePayload,
  rasterBarcodeReplace,
  scanBarcodeImage
} from './rasterBarcode.js'

export {
  assertRfidHex,
  attachTemplateRfid,
  createRfidConfig,
  evaluateRfid,
  padSeq,
  toEpcHex
} from './rfid.js'

export const PRINT_JOB_KIND = 'pdfDataJob'
/** sessionStorage: print-data → designer first-row sample */
export const PRINT_JOB_SAMPLE_STORAGE_KEY = 'tk-report-job-sample-v1'
export const PRINT_MODE_SAMPLE = 'sample'
export const PRINT_MODE_PRODUCTION = 'production'
export const PRINT_LAYOUT_RASTER = 'raster'
export const PRINT_LAYOUT_TEMPLATE = 'template'
/** @deprecated Coerced to raster: PDF bitmap + Grade-A barcode replace. */
export const PRINT_LAYOUT_OVERLAY = 'overlay'

export {
  detectPdfBarcode,
  expandHriMatchBox,
  findPdfBarcodeRegion,
  rasterBarcodePayload,
  rasterBarcodeReplace,
  scanBarcodeImage
}

const PDF_CSS_SCALE = 96 / 72

export function createPrintJob (name = '') {
  return {
    schemaVersion: 1,
    kind: PRINT_JOB_KIND,
    id: '',
    name: String(name || '').trim(),
    rows: [],
    fields: { key: '', qty: '', packQty: '', cartonQty: '', template: '', customer: '', item: '' },
    itemTemplates: {},
    copies: { mode: 'qty' },
    sourcePdfs: [],
    match: {
      pageText: true,
      box: { x: 0, y: 0, width: 0, height: 0 },
      fileName: false,
      fileNamePattern: ''
    },
    matchResult: [],
    printState: {},
    layout: PRINT_LAYOUT_RASTER,
    templateId: '',
    rowTemplates: {},
    pdfTemplates: {},
    genericPdf: '',
    datasetVar: '',
    ingest: null,
    rfid: createRfidConfig(),
    updatedAt: null
  }
}

export function printLayoutOf (job) {
  const v = job && job.layout
  if (v === PRINT_LAYOUT_TEMPLATE) return PRINT_LAYOUT_TEMPLATE
  return PRINT_LAYOUT_RASTER
}

export function isPrintJob (value) {
  return value != null && typeof value === 'object' && value.kind === PRINT_JOB_KIND
}

export function normalizeKey (value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function cellValue (row, field) {
  if (row == null || !field) return ''
  const v = row[field]
  if (v == null) return ''
  return v
}

function normFieldName (name) {
  return String(name ?? '').replace(/[\s_\-#.:：]+/g, '').toLowerCase()
}

function pickField (keys, cands, opts = {}) {
  const required = !!opts.required
  const index = new Map((keys || []).map((k) => [normFieldName(k), k]))
  for (const c of cands) {
    const hit = index.get(normFieldName(c))
    if (hit) return hit
  }
  if (opts.includes !== false) {
    const used = new Set(opts.used || [])
    for (const c of cands) {
      const cl = normFieldName(c)
      if (cl.length < 2) continue
      for (const k of keys || []) {
        if (used.has(k)) continue
        const lk = normFieldName(k)
        if (lk === cl || (cl.length >= 2 && lk.includes(cl))) return k
      }
    }
  }
  return required ? (keys && keys[0]) || '' : ''
}

export function copiesForRow (row, fields = {}, copies = {}) {
  const mode = copies && copies.mode
  if (mode === 'carton') {
    const cartons = Number(cellValue(row, fields.cartonQty))
    if (Number.isFinite(cartons) && cartons > 0) return Math.floor(cartons)
    const qty = Number(cellValue(row, fields.qty))
    const pack = Number(cellValue(row, fields.packQty))
    if (Number.isFinite(qty) && qty > 0 && Number.isFinite(pack) && pack > 0) {
      return Math.floor(qty / pack)
    }
    return 0
  }
  const qty = Number(cellValue(row, fields.qty))
  if (!Number.isFinite(qty) || qty <= 0) return 0
  if (mode === 'qtyOverPack') {
    const pack = Number(cellValue(row, fields.packQty))
    if (!Number.isFinite(pack) || pack <= 0) return 0
    return Math.floor(qty / pack)
  }
  return Math.floor(qty)
}

export function guessFields (rows) {
  const keys = rows && rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : []
  const key = pickField(keys, [
    '客户 ITEM', '客户ITEM', 'customer item', 'item', 'sku', 'dpci', '物料编码',
    'po', 'pono', 'po_no', 'p/o', '订单号'
  ], { required: true, includes: false })
  const item = pickField(keys, ['ITEM', '物料编码', 'sku'], { includes: false })
  const customer = pickField(keys, ['客户名称', 'customername', 'customer', 'custname'], { includes: false })
  const qty = pickField(keys, ['订单数量', 'qty', 'quantity', 'orderqty', '数量', 'qtyordered'], { required: true, includes: false })
  const packQty = pickField(keys, ['装箱数', 'packqty', 'pack_qty', 'pack', '装箱'], { includes: false })
  const cartonQty = pickField(keys, ['总箱数', 'cartonqty', 'cartons', 'cases', '总箱'], { includes: false })
  const template = pickField(keys, ['templateid', 'template', '标签模板', '模板', 'tmpl'])
  return { key, qty, packQty, cartonQty, template, customer, item }
}

export function rowTemplateMap (job) {
  const src = job && job.rowTemplates
  if (!src || typeof src !== 'object' || Array.isArray(src)) return {}
  const out = {}
  for (const [k, v] of Object.entries(src)) {
    const id = String(v || '').trim()
    if (id) out[String(k)] = id
  }
  return out
}

/** Specified per-line template wins; otherwise the job-level generic template. */
export function resolveTemplateId (job, rowIndex) {
  const specified = rowTemplateMap(job)[String(rowIndex)] || ''
  if (specified) return specified
  return String((job && job.templateId) || '').trim()
}

export function pdfTemplateMap (job) {
  const src = job && job.pdfTemplates
  if (!src || typeof src !== 'object' || Array.isArray(src)) return {}
  const out = {}
  for (const [k, v] of Object.entries(src)) {
    const id = String(v || '').trim()
    if (id) out[String(k)] = id
  }
  return out
}

export function templateIdFromPdfFileName (fileName) {
  return String(fileName || '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.(json|pdf)$/i, '')
    .trim()
}

export function sourcePdfFileNames (job) {
  return (Array.isArray(job && job.sourcePdfs) ? job.sourcePdfs : [])
    .map((s) => s && s.fileName)
    .filter(Boolean)
}

export function resolvedGenericPdf (job) {
  const files = sourcePdfFileNames(job)
  const g = String((job && job.genericPdf) || '').trim()
  if (g && files.includes(g)) return g
  if (files.length === 1) return files[0]
  return ''
}

export function sourcePdfFileNameForRow (job, rowIndex) {
  const specified = rowTemplateMap(job)[String(rowIndex)] || ''
  if (specified) {
    const hit = Object.entries(pdfTemplateMap(job)).find(([, id]) => id === specified)
    if (hit) return hit[0]
  }
  const ref = pageRefForRow(job, rowIndex)
  if (ref?.fileName) return ref.fileName
  const generic = resolvedGenericPdf(job)
  if (generic) return generic
  const tid = resolveTemplateId(job, rowIndex)
  if (!tid) return ''
  const hit = Object.entries(pdfTemplateMap(job)).find(([, id]) => id === tid)
  return hit ? hit[0] : ''
}

/**
 * One imported PDF → every line uses that JSON. Several PDFs → matched
 * lines use that file's JSON; unmatched lines use the designated generic PDF.
 */
export function applyPdfSourceTemplates (job) {
  if (!job) return job
  const files = sourcePdfFileNames(job)
  const map = pdfTemplateMap(job)
  if (!files.length) return job
  const genericFile = resolvedGenericPdf(job)
  job.genericPdf = genericFile
  job.templateId = genericFile ? (map[genericFile] || templateIdFromPdfFileName(genericFile)) : ''
  if (files.length === 1) {
    job.rowTemplates = {}
    return job
  }
  const next = {}
  for (const m of job.matchResult || []) {
    if (m.status !== 'matched' || m.rowIndex == null) continue
    const fileName = m.pageRef && m.pageRef.fileName
    if (!fileName || !files.includes(fileName)) continue
    const id = map[fileName]
    if (id) next[String(m.rowIndex)] = id
  }
  job.rowTemplates = next
  return job
}

export function collectJobTemplateIds (job, rowIndexes) {
  const ids = []
  const seen = new Set()
  const add = (id) => {
    const s = String(id || '').trim()
    if (!s || seen.has(s)) return
    seen.add(s)
    ids.push(s)
  }
  const rows = Array.isArray(job && job.rows) ? job.rows : []
  const indexes = Array.isArray(rowIndexes) && rowIndexes.length
    ? rowIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0)
    : rows.map((_, i) => i)
  for (const i of indexes) add(resolveTemplateId(job, i))
  add(job && job.templateId)
  return ids
}

export function templateKeyOf (value) {
  return String(value ?? '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.[pP][dD][fF]$/, '')
    .replace(/[\s_\-]+/g, '')
    .toLowerCase()
}

export function findMatchingTemplateId (templateIds, value) {
  const n = templateKeyOf(value)
  if (!n) return ''
  const ids = (templateIds || []).map((id) => String(id || '').trim()).filter(Boolean)
  const exact = ids.find((id) => templateKeyOf(id) === n)
  if (exact) return exact
  const hits = ids.filter((id) => {
    const t = templateKeyOf(id)
    return t.length >= 4 && n.startsWith(t)
  })
  return hits.length === 1 ? hits[0] : ''
}

/**
 * Fill unspecified row templates from Excel values vs template ids.
 * Already-specified rows are left alone. Unmatched rows keep the generic template.
 */
export function customerItemKey (row, fields = {}) {
  const customer = normalizeKey(cellValue(row, fields.customer))
  const item = normalizeKey(cellValue(row, fields.item))
  const key = normalizeKey(cellValue(row, fields.key))
  const itemPart = item || key
  if (customer && itemPart) return `${templateKeyOf(customer)}|${templateKeyOf(itemPart)}`
  return templateKeyOf(itemPart || customer)
}

export function listCustomerItemGroups (job) {
  const rows = Array.isArray(job && job.rows) ? job.rows : []
  const fields = (job && job.fields) || {}
  const groups = []
  const map = new Map()
  rows.forEach((row, i) => {
    const key = customerItemKey(row, fields)
    if (!key) return
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        customer: normalizeKey(cellValue(row, fields.customer)),
        item: normalizeKey(cellValue(row, fields.item || fields.key)),
        rowIndexes: [],
        templateId: ''
      }
      map.set(key, g)
      groups.push(g)
    }
    g.rowIndexes.push(i)
  })
  for (const g of groups) {
    g.templateId = resolveTemplateId(job, g.rowIndexes[0])
  }
  return groups
}

export function itemTemplateMap (job) {
  const src = job && job.itemTemplates
  if (!src || typeof src !== 'object' || Array.isArray(src)) return {}
  const out = {}
  for (const [k, v] of Object.entries(src)) {
    const id = String(v || '').trim()
    if (id) out[String(k)] = id
  }
  return out
}

/** Bind one RFID JSON 唛头 to every PO of the same customer+ITEM. */
export function applyItemTemplates (job) {
  if (!job) return job
  const map = itemTemplateMap(job)
  if (!Object.keys(map).length) return job
  const assigned = { ...rowTemplateMap(job) }
  for (const g of listCustomerItemGroups(job)) {
    const id = map[g.key] || ''
    for (const i of g.rowIndexes) {
      if (id) assigned[String(i)] = id
      else delete assigned[String(i)]
    }
  }
  job.rowTemplates = assigned
  return job
}

export function assignTemplateToCustomerItem (job, groupKey, templateId) {
  if (!job) return {}
  const id = String(templateId || '').trim()
  const next = { ...itemTemplateMap(job) }
  const key = String(groupKey || '').trim()
  if (!key) {
    if (id) job.templateId = id
    return rowTemplateMap(job)
  }
  if (id) next[key] = id
  else delete next[key]
  job.itemTemplates = next
  applyItemTemplates(job)
  const ids = listCustomerItemGroups(job).map((g) => String(next[g.key] || '').trim())
  if (ids.length && ids.every((x) => x && x === ids[0])) job.templateId = ids[0]
  else if (ids.some((x) => x && x !== job.templateId)) job.templateId = ''
  return rowTemplateMap(job)
}

/** 按勾选的明细行指定唛头；indexes 为空则指定全部行。 */
export function assignTemplateToRows (job, rowIndexes, templateId) {
  if (!job) return {}
  const id = String(templateId || '').trim()
  const rows = Array.isArray(job.rows) ? job.rows : []
  const assigned = { ...rowTemplateMap(job) }
  const indexes = Array.isArray(rowIndexes) && rowIndexes.length
    ? rowIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < rows.length)
    : rows.map((_, i) => i)
  for (const i of indexes) {
    if (id) assigned[String(i)] = id
    else delete assigned[String(i)]
  }
  job.rowTemplates = assigned
  job.itemTemplates = {}
  const ids = rows.map((_, i) => String(assigned[String(i)] || '').trim())
  const uniq = [...new Set(ids.filter(Boolean))]
  if (ids.length && ids.every((x) => x && x === ids[0])) job.templateId = ids[0]
  else if (uniq.length === 1 && ids.every((x) => !x || x === uniq[0])) job.templateId = uniq[0]
  else job.templateId = ''
  return assigned
}

export function matchTemplatesToRows (job, templateIds) {
  const assigned = { ...rowTemplateMap(job) }
  const rows = Array.isArray(job && job.rows) ? job.rows : []
  const fields = (job && job.fields) || {}
  const templateField = fields.template || ''
  const keyField = fields.key || ''
  const itemField = fields.item || ''
  const customerField = fields.customer || ''
  rows.forEach((row, i) => {
    const key = String(i)
    if (assigned[key]) return
    const sources = []
    if (templateField) sources.push(cellValue(row, templateField))
    if (itemField) {
      const item = cellValue(row, itemField)
      const customer = customerField ? cellValue(row, customerField) : ''
      if (customer && item) sources.push(`${customer} ${item}`, `${customer}|${item}`)
      sources.push(item)
    }
    if (keyField) sources.push(cellValue(row, keyField))
    for (const k of Object.keys(row || {})) {
      if (k === templateField || k === keyField || k === itemField || k === customerField) continue
      sources.push(row[k])
    }
    for (const src of sources) {
      const hit = findMatchingTemplateId(templateIds, src)
      if (hit) {
        assigned[key] = hit
        break
      }
    }
  })
  return assigned
}

export function keyFromFileName (fileName, pattern, keyField) {
  const name = String(fileName || '').replace(/^.*[/\\]/, '')
  const pat = String(pattern || '').trim()
  if (!pat) return normalizeKey(name.replace(/\.pdf$/i, ''))
  const token = `{${keyField || 'PO'}}`
  const idx = pat.indexOf(token)
  if (idx < 0) {
    const any = pat.match(/\{[^}]+\}/)
    if (!any) return normalizeKey(name.replace(/\.pdf$/i, ''))
    return keyFromFileName(fileName, pat, any[0].slice(1, -1))
  }
  const prefix = pat.slice(0, idx)
  const suffix = pat.slice(idx + token.length)
  if (name.toLowerCase().startsWith(prefix.toLowerCase()) &&
      name.toLowerCase().endsWith(suffix.toLowerCase())) {
    return normalizeKey(name.slice(prefix.length, name.length - suffix.length))
  }
  return ''
}

export function lineHitsBox (line, box, pageHeightPt) {
  if (!box || !(Number(box.width) > 0) || !(Number(box.height) > 0)) return false
  const x = Number(line.xPt) * PDF_CSS_SCALE
  const y = Number(line.yTopPt != null
    ? line.yTopPt
    : (Number(pageHeightPt) - Number(line.baselineFromBottom || 0) - Number(line.hPt || 0))) * PDF_CSS_SCALE
  const w = Number(line.wPt) * PDF_CSS_SCALE
  const h = Number(line.hPt || line.fontSize || 8) * PDF_CSS_SCALE
  const bx = Number(box.x) || 0
  const by = Number(box.y) || 0
  const bw = Number(box.width) || 0
  const bh = Number(box.height) || 0
  return !(x + w < bx || bx + bw < x || y + h < by || by + bh < y)
}

export function extractKeyFromLines (textLines, box, pageHeightPt) {
  const hits = (textLines || []).filter((l) => lineHitsBox(l, box, pageHeightPt))
  hits.sort((a, b) => (a.yTopPt - b.yTopPt) || (a.xPt - b.xPt))
  return normalizeKey(hits.map((l) => l.content || '').join(''))
}

/**
 * UPC-A HRI puts the number-system and check digits in the quiet zones
 * (different Y from the 10 digits under the bars). Left-to-right digits
 * recover 11/12-digit values that y-then-x concatenation would scramble.
 * UPC-E is the same (NS left, check right). EAN-13 only parks the first
 * digit in the left quiet zone.
 */
export function extractDigitsFromLines (textLines, box, pageHeightPt) {
  const hits = (textLines || []).filter((l) => lineHitsBox(l, box, pageHeightPt))
  hits.sort((a, b) => (Number(a.xPt) - Number(b.xPt)) || (Number(a.yTopPt) - Number(b.yTopPt)))
  return hits.map((l) => String(l.content || '').replace(/\D/g, '')).join('')
}

function retailDigits (value) {
  const s = String(value ?? '')
  const ai = s.match(/\(0?1\)\s*(\d{13,14})/)
  if (ai) return ai[1]
  const d = s.replace(/\D/g, '')
  if (d.startsWith('01') && (d.length === 15 || d.length === 16)) return d.slice(2)
  return d
}

function upcEBodies (d) {
  const body11 = (ns, compact6) => expandUpcE(ns, compact6, '0').slice(0, 11)
  const out = []
  if (d.length === 6) out.push(body11('0', d))
  if (d.length === 7) {
    out.push(body11('0', d.slice(0, 6)))
    if (d[0] === '0' || d[0] === '1') out.push(body11(d[0], d.slice(1)))
  }
  if (d.length === 8 && (d[0] === '0' || d[0] === '1')) {
    out.push(body11(d[0], d.slice(1, 7)))
  }
  return out.filter((b) => /^\d{11}$/.test(b))
}

/**
 * 13-digit GTIN bodies (check digit stripped / padded). Same product matches
 * across UPC-A 11/12, UPC-E 6–8, EAN-8 7/8, EAN-13 12/13, and ITF-14 13/14.
 * Code 128 / Code 39 / QR keep exact-string matching; their check lives in
 * the bars and is not part of the HRI.
 */
export function gtinBodyKeys (value) {
  const keys = new Set()
  const add = (body) => {
    const b = String(body || '').replace(/\D/g, '').padStart(13, '0').slice(-13)
    if (/^\d{13}$/.test(b)) keys.add(b)
  }
  const d = retailDigits(value)
  if (!d) return keys
  if (d.length === 7) add(d)
  if (d.length === 8) add(d.slice(0, 7))
  if (d.length === 11) add(d)
  if (d.length === 12) {
    add(d.slice(0, 11))
    add(d)
  }
  if (d.length === 13) {
    add(d.slice(0, 12))
    add(d)
  }
  if (d.length === 14) add(d.slice(0, 13))
  for (const b of upcEBodies(d)) add(b)
  return keys
}

/** 11-digit UPC-A payload (check digit stripped). */
export function upcPayloadKey (value) {
  const d = String(value ?? '').replace(/\D/g, '')
  if (d.length === 12) return d.slice(0, 11)
  if (d.length === 11) return d
  if (d.length === 13 && d[0] === '0') return d.slice(1, 12)
  return ''
}

function pushIndex (map, key, rowIndex) {
  if (!key) return
  const list = map.get(key) || []
  list.push(rowIndex)
  map.set(key, list)
}

function lookupRowIndex (byKey, byGtin, raw) {
  const nk = normalizeKey(raw)
  if (nk) {
    const list = byKey.get(nk.toLowerCase())
    if (list && list.length) return list[0]
  }
  for (const k of gtinBodyKeys(raw)) {
    const list = byGtin.get(k)
    if (list && list.length) return list[0]
  }
  return undefined
}

function addCandidate (out, value) {
  const n = normalizeKey(value)
  if (n && !out.includes(n)) out.push(n)
}

/**
 * Keys to try for a user box around barcode + HRI (or plain text).
 * Decoded symbol / HRI first so a retail check digit is not required in Excel.
 */
export function extractMatchCandidates (page, box) {
  const fromText = extractKeyFromLines(page && page.textLines, box, page && page.pageHeightPt)
  const fromDigits = extractDigitsFromLines(page && page.textLines, box, page && page.pageHeightPt)
  const out = []
  const hasBox = box && Number(box.width) > 0 && Number(box.height) > 0
  if (hasBox) {
    const detected = detectPdfBarcode(page, box)
    if (detected) {
      addCandidate(out, detected.content)
      addCandidate(out, detected.hri)
    }
  }
  addCandidate(out, fromText)
  addCandidate(out, fromDigits)
  return out
}

export function matchPagesToRows (job, pages) {
  const rows = Array.isArray(job.rows) ? job.rows : []
  const fields = job.fields || {}
  const keyField = fields.key
  const match = job.match || {}
  const byKey = new Map()
  const byGtin = new Map()
  rows.forEach((row, rowIndex) => {
    const k = normalizeKey(cellValue(row, keyField))
    if (!k) return
    pushIndex(byKey, k.toLowerCase(), rowIndex)
    for (const g of gtinBodyKeys(k)) pushIndex(byGtin, g, rowIndex)
  })

  const usedRows = new Set()
  const result = []
  for (const page of pages || []) {
    const cands = []
    if (match.fileName) {
      addCandidate(cands, keyFromFileName(page.fileName, match.fileNamePattern, keyField))
    }
    if (match.pageText !== false) {
      const fromPage = extractMatchCandidates(page, match.box)
      if (fromPage.length) cands.length = 0
      fromPage.forEach((c) => addCandidate(cands, c))
    }
    let key = cands[0] || ''
    let rowIndex
    for (const cand of cands) {
      const hit = lookupRowIndex(byKey, byGtin, cand)
      if (hit != null) {
        key = cand
        rowIndex = hit
        break
      }
    }
    const nk = normalizeKey(key)
    const copies = rowIndex == null ? 0 : copiesForRow(rows[rowIndex], fields, job.copies)
    const status = rowIndex == null ? 'unmatchedPage' : (copies > 0 ? 'matched' : 'zeroCopies')
    if (rowIndex != null) usedRows.add(rowIndex)
    result.push({
      pageRef: { fileName: page.fileName, pageIndex: page.pageIndex },
      key: nk,
      rowIndex: rowIndex == null ? null : rowIndex,
      copies,
      status
    })
  }
  rows.forEach((row, rowIndex) => {
    if (usedRows.has(rowIndex)) return
    const k = normalizeKey(cellValue(row, keyField))
    if (!k) return
    const copies = copiesForRow(row, fields, job.copies)
    result.push({
      pageRef: null,
      key: k,
      rowIndex,
      copies,
      status: 'unmatchedRow'
    })
  })
  return result
}

export function rowIndexesWithCopies (job) {
  const out = []
  const rows = Array.isArray(job.rows) ? job.rows : []
  for (let i = 0; i < rows.length; i++) {
    if (copiesForRow(rows[i], job.fields, job.copies) > 0) out.push(i)
  }
  return out
}

export function jobCanPrintWithoutPdf (job) {
  return printLayoutOf(job) === PRINT_LAYOUT_TEMPLATE
}

export function linePrintStatus (job, rowIndex) {
  const row = job && job.rows && job.rows[rowIndex]
  const copies = copiesForRow(row, job && job.fields, job && job.copies)
  if (copies <= 0) return 'zeroCopies'
  if (printLayoutOf(job) === PRINT_LAYOUT_TEMPLATE) {
    return resolveTemplateId(job, rowIndex) ? 'matched' : 'noTemplate'
  }
  if (pageRefForRow(job, rowIndex)) return 'matched'
  if (jobCanPrintWithoutPdf(job)) return 'templateOnly'
  return 'unmatchedRow'
}

export function matchedLineIndexes (job) {
  if (jobCanPrintWithoutPdf(job)) {
    return rowIndexesWithCopies(job).filter((i) => resolveTemplateId(job, i))
  }
  const seen = new Set()
  const out = []
  for (const m of job.matchResult || []) {
    if (m.status !== 'matched') continue
    if (m.rowIndex == null || seen.has(m.rowIndex)) continue
    seen.add(m.rowIndex)
    out.push(m.rowIndex)
  }
  return out
}

export function resolveRowIndexes (job, rowIndexes) {
  const allowed = new Set(matchedLineIndexes(job))
  if (Array.isArray(rowIndexes) && rowIndexes.length) {
    const out = []
    const seen = new Set()
    for (const raw of rowIndexes) {
      const n = Number(raw)
      if (!allowed.has(n) || seen.has(n)) continue
      seen.add(n)
      out.push(n)
    }
    return out
  }
  return [...allowed]
}

export function pageRefForRow (job, rowIndex) {
  const hit = (job.matchResult || []).find((m) => m.rowIndex === rowIndex && m.pageRef && m.status === 'matched')
  return hit ? hit.pageRef : null
}

function orderOffsetBefore (job, rowIndex) {
  let acc = 0
  for (const i of matchedLineIndexes(job)) {
    if (i === rowIndex) break
    acc += copiesForRow(job.rows[i], job.fields, job.copies)
  }
  return acc
}

export function expandPrintItems (job, mode, rowIndexes) {
  const indexes = resolveRowIndexes(job, rowIndexes)
  const sample = mode === PRINT_MODE_SAMPLE
  const rfid = job.rfid || {}
  const seqStart = Number.isFinite(Number(rfid.seqStart)) ? Number(rfid.seqStart) : 1
  const items = []
  for (const rowIndex of indexes) {
    const row = job.rows[rowIndex]
    const copies = copiesForRow(row, job.fields, job.copies)
    if (copies <= 0) continue
    const n = sample ? 1 : copies
    const pageRef = pageRefForRow(job, rowIndex)
    const key = normalizeKey(cellValue(row, job.fields && job.fields.key))
    for (let copyIndex = 0; copyIndex < n; copyIndex++) {
      const seqNum = rfid.seqScope === 'order'
        ? seqStart + orderOffsetBefore(job, rowIndex) + copyIndex
        : seqStart + copyIndex
      const seq = padSeq(seqNum, rfid.seqPad)
      items.push({
        rowIndex,
        copyIndex,
        seq: seqNum,
        seqText: seq,
        key,
        templateId: resolveTemplateId(job, rowIndex),
        pageRef,
        row,
        epc: rfid.enabled ? evaluateRfid(rfid, row, key, seq) : ''
      })
    }
  }
  return items
}

export function firstDatasetVar (template, fallback = 'ds1') {
  const hinted = template && template.datasetVar
  if (hinted && String(hinted).trim()) return String(hinted).trim()
  const ds = template && template.dataset
  if (!ds || typeof ds !== 'object') return fallback
  for (const k of Object.keys(ds)) {
    if (k === 'param') continue
    return k
  }
  return fallback
}

/** Dataset name the label driver will iterate: job hint, first `${ds.*}` head, else first dataset key. */
export function labelDriverDatasetVar (template, hinted = '') {
  if (hinted && String(hinted).trim()) return String(hinted).trim()
  const elements = (template && template.elements) || []
  const ds = (template && template.dataset) || {}
  for (const el of elements) {
    const tokens = String(el.content || '').match(/\$\{([^}]+)\}/g) || []
    for (const raw of tokens) {
      const token = raw.slice(2, -1).trim()
      if (!token) continue
      const path = getIterationArrayPath(token, ds)
      if (!path) continue
      const head = String(path).split('.')[0]
      if (head && head !== 'param') return head
    }
  }
  return firstDatasetVar(template)
}

const PLACEHOLDER_IN_CONTENT_RE = /\$\{[^}]+\}/
const BARCODE_VALUE_FIELDS = ['UPC', 'EAN', 'GTIN', 'BARCODE', '条码', '条形码']
const KEEP_BARCODE_META = new Set(['barcodeFormat', 'barcodeDisplayValue', 'barcodeFit'])
const INTERNAL_ROW_KEYS = new Set(['_seq', '_copyIndex', '_key'])
/** 绑定占位符用的别名，不是导入表头，禁止写回作业行、禁止当第一步列名。 */
const INVENTED_RETAIL_TITLES = new Set([
  'SKU', 'QTY', 'GS1128', 'ITF14', 'SSCC', 'DPCI', 'DESC', 'CUSTOMER', 'COO', 'VENDOR', 'GTIN'
])

function rowHasValue (row, names) {
  const src = row && typeof row === 'object' ? row : {}
  for (const n of names) {
    if (n && src[n] != null && String(src[n]).trim() !== '') return true
  }
  return false
}

/** 去掉 retailAliasFields 贴上去的 SKU / QTY / GS1128 等，只留导入表自己的列。 */
export function withoutInventedRetailTitles (row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row
  const out = { ...row }
  if (rowHasValue(out, ['客户 ITEM', '客户ITEM', 'Home Depot SKU'])) {
    delete out.SKU
    delete out.DPCI
  }
  if (rowHasValue(out, ['装箱数', '订单数量', '数量', 'QTY/CTN', 'packqty'])) delete out.QTY
  if (rowHasValue(out, ['物料名称', '品名', 'DESCRIPTION', 'description'])) delete out.DESC
  if (rowHasValue(out, ['客户名称', 'customer', 'customername'])) delete out.CUSTOMER
  if (rowHasValue(out, ['产地', 'Country of Origin', 'countryoforigin'])) delete out.COO
  if (rowHasValue(out, ['供应商', 'Vendor', 'Vendor#'])) delete out.VENDOR
  if (rowHasValue(out, ['UPC', 'EAN', '条码', '条形码', '商品条码', 'barcode', 'upc-a'])) {
    delete out.GTIN
    delete out.ITF14
  }
  if (rowHasValue(out, ['UPC', 'EAN', 'GTIN', 'PO', '客户 ITEM', '客户ITEM', '装箱数', 'SKU'])) {
    delete out.GS1128
  }
  for (const k of Object.keys(out)) {
    if (INTERNAL_ROW_KEYS.has(k)) delete out[k]
  }
  return out
}

export function importedFieldNames (rows) {
  const first = (rows || []).find((r) => r && typeof r === 'object')
  if (!first) return []
  return Object.keys(withoutInventedRetailTitles(first)).filter((k) => !INVENTED_RETAIL_TITLES.has(k))
}

function fieldKeyOf (name) {
  return String(name ?? '').replace(/[\s_\-#.:：]+/g, '').toLowerCase()
}

function bindableFieldNames (keys) {
  return (keys || []).filter((k) => k && !INTERNAL_ROW_KEYS.has(String(k)))
}

function findFieldForLabel (content, keys) {
  const fields = bindableFieldNames(keys)
  if (!fields.length) return ''
  const labelPart = String(content || '').trim().split(/[:：]/)[0].trim()
  const labelKey = fieldKeyOf(labelPart)
  if (!labelKey) return ''
  const ranked = [...fields].sort((a, b) => fieldKeyOf(b).length - fieldKeyOf(a).length)
  for (const f of ranked) {
    if (fieldKeyOf(f) === labelKey) return f
  }
  const prefixHits = ranked.filter((f) => {
    const fk = fieldKeyOf(f)
    if (fk.length < 2 || labelKey.length < 2) return false
    return labelKey.startsWith(fk) || fk.startsWith(labelKey) || fk.endsWith(labelKey) || labelKey.endsWith(fk)
  })
  if (prefixHits.length === 1) return prefixHits[0]
  const containsHits = ranked.filter((f) => {
    const fk = fieldKeyOf(f)
    return fk.length >= 3 && (labelKey.includes(fk) || fk.includes(labelKey))
  })
  return containsHits.length === 1 ? containsHits[0] : ''
}

function pickRowField (keys, cands) {
  const lower = new Map((keys || []).map((k) => [String(k).toLowerCase(), k]))
  for (const c of cands) {
    const hit = lower.get(String(c).toLowerCase())
    if (hit) return hit
  }
  return ''
}

function looksRetailUpc (value) {
  const d = String(value || '').replace(/\D/g, '')
  return d.length === 11 || d.length === 12 || d.length === 13
}

function stripImportedBarcodeGeometry (el) {
  for (const k of Object.keys(el)) {
    if (KEEP_BARCODE_META.has(k)) continue
    if (k.startsWith('barcode')) delete el[k]
  }
}

function sampleBindRow (items) {
  const item = (items && items[0]) || {}
  const row = item.row && typeof item.row === 'object' ? item.row : {}
  return {
    ...row,
    _seq: item.seqText,
    _copyIndex: item.copyIndex,
    _key: item.key
  }
}

function pickRowValue (row, ...names) {
  const src = row && typeof row === 'object' ? row : {}
  for (const n of names) {
    if (!n) continue
    const v = src[n]
    if (v != null && String(v).trim() !== '') return v
  }
  const index = new Map(Object.keys(src).map((k) => [normFieldName(k), k]))
  for (const n of names) {
    if (!n) continue
    const hit = index.get(normFieldName(n))
    if (!hit) continue
    const v = src[hit]
    if (v != null && String(v).trim() !== '') return v
  }
  return ''
}

function looksLikeDpci (value) {
  return /^\d{3}-\d{2}-\d{4}$/.test(String(value || '').trim())
}

function dpciFromRow (src, fields = {}) {
  const named = pickRowValue(src, '客户 ITEM', '客户ITEM', 'DPCI', 'customer item')
  if (named) return named
  const keyName = normFieldName(fields.key)
  if (keyName && (keyName.includes('item') || keyName.includes('dpci') || keyName.includes('sku'))) {
    return pickRowValue(src, fields.key)
  }
  const keyVal = pickRowValue(src, fields.key)
  return looksLikeDpci(keyVal) ? keyVal : ''
}

/** Map 客户 ITEM / PO / 物料名称 onto DPCI / PO / UPC so RFID JSON placeholders fill. */
export function retailAliasFields (row, fields = {}) {
  const src = row && typeof row === 'object' ? row : {}
  const aliases = {
    DPCI: dpciFromRow(src, fields),
    ITEM: pickRowValue(src, fields.item, 'ITEM', '物料编码', 'sku'),
    PO: pickRowValue(src, 'PO', '客户PO', '客户 PO', 'PO#', 'P/O', 'pono', '订单号'),
    UPC: pickRowValue(
      src,
      'UPC', 'EAN', 'GTIN', '条码', '条形码', 'barcode', 'upc-a',
      'UPC码', 'UPC编码', '商品条码', '国际条码', 'EAN码', 'EAN13', 'EAN-13',
      'GTIN-12', 'GTIN12', '条码号', '条形码号', 'upccode', 'upc_code', 'U.P.C.', 'UPC-A'
    ),
    DESC: pickRowValue(src, '物料名称', '品名', 'DESC', 'DESCRIPTION', 'description'),
    CUSTOMER: pickRowValue(src, fields.customer, '客户名称', 'customer', 'customername'),
    COO: pickRowValue(src, '产地', 'COO', 'Country of Origin', 'countryoforigin'),
    SKU: pickRowValue(src, 'SKU', '客户 ITEM', '客户ITEM', 'Home Depot SKU'),
    QTY: pickRowValue(src, '装箱数', 'QTY', 'QTY/CTN', 'packqty', '数量'),
    VENDOR: pickRowValue(src, '供应商', 'VENDOR', 'Vendor', 'Vendor#'),
    GTIN: pickRowValue(src, 'GTIN', 'EAN14'),
    ITF14: pickRowValue(src, 'ITF14', 'ITF-14', 'EAN14'),
    SSCC: pickRowValue(src, 'SSCC', 'SSCC18', 'SSCC-18'),
    GS1128: pickRowValue(src, 'GS1128', 'GS1-128', 'UCC128', 'EAN128')
  }
  const out = { ...src }
  for (const [k, v] of Object.entries(aliases)) {
    if (v !== '' && (out[k] == null || String(out[k]).trim() === '')) out[k] = v
  }
  if (!String(out.UPC || '').trim()) {
    const fallback = String(out.DPCI || '').trim() || String(out.ITEM || '').trim()
    if (looksRetailUpc(fallback)) out.UPC = fallback
  }
  if (!String(out.GTIN || '').trim()) {
    const upc = String(out.UPC || '').replace(/\D/g, '')
    if (upc.length === 12 || upc.length === 13 || upc.length === 14) out.GTIN = upc
  }
  if (!String(out.ITF14 || '').trim()) {
    const g = String(out.GTIN || out.UPC || '').replace(/\D/g, '')
    if (g.length === 14) out.ITF14 = g
    else if (g.length === 13) out.ITF14 = `0${g}`
    else if (g.length === 12) out.ITF14 = `00${g}`
  }
  if (!String(out.GS1128 || '').trim()) {
    const parts = []
    const gtin = String(out.GTIN || out.ITF14 || '').replace(/\D/g, '')
    if (gtin.length === 14) parts.push(`(01)${gtin}`)
    else if (gtin.length === 13) parts.push(`(01)0${gtin}`)
    else if (gtin.length === 12) parts.push(`(01)00${gtin}`)
    if (out.PO) parts.push(`(400)${String(out.PO).trim()}`)
    if (out.QTY) parts.push(`(37)${String(out.QTY).replace(/\D/g, '')}`)
    if (!gtin && out.SKU) parts.push(`(91)${String(out.SKU).trim()}`)
    if (parts.length) out.GS1128 = parts.join('')
  }
  return out
}

function datasetRowsOf (value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && Array.isArray(value.data)) return value.data
  return null
}

/** Clone a designer/print dataset and write retail aliases onto every row. */
export function aliasDatasetRows (dataset, fields = {}) {
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) return dataset || {}
  const out = { ...dataset }
  for (const [key, value] of Object.entries(out)) {
    if (key === 'param') continue
    const rows = datasetRowsOf(value)
    if (!rows) continue
    const aliased = rows.map((row) => retailAliasFields(row, fields))
    out[key] = Array.isArray(value) ? aliased : { ...value, data: aliased }
  }
  return out
}

export function previewDatasetPayload (dataset, fields = {}, maxRows = 20) {
  const aliased = aliasDatasetRows(dataset, fields)
  const out = {}
  const cap = Number(maxRows) > 0 ? Number(maxRows) : 20
  for (const [key, value] of Object.entries(aliased || {})) {
    if (key === 'param') continue
    const rows = datasetRowsOf(value)
    if (!rows || !rows.length) continue
    out[key] = rows.slice(0, cap)
  }
  return Object.keys(out).length ? out : null
}

/** 工作区导入行 → 设计器 EXCEL 数据集（字段名用导入表自己的列）。 */
export function excelDatasetFromRows (rows, opts = {}) {
  const data = (Array.isArray(rows) ? rows : []).map((row) => withoutInventedRetailTitles(row))
  const fields = importedFieldNames(data)
  const varName = String(opts.varName || 'ds1').trim() || 'ds1'
  return {
    [varName]: {
      name: opts.name || varName,
      type: 'EXCEL',
      fileName: opts.fileName || '',
      sheetName: opts.sheetName || '',
      paramNames: [],
      fields,
      expanded: true,
      selectedFields: [],
      fieldAnchorIndex: -1,
      data
    }
  }
}

/** 从模板/设计器 dataset 取出明细行（优先第一个有 data 的变量）。 */
export function rowsFromDataset (dataset) {
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) return []
  const preferred = String((dataset.ds1 && 'ds1') || '').trim()
  const keys = preferred && dataset.ds1 != null
    ? ['ds1', ...Object.keys(dataset).filter((k) => k !== 'ds1' && k !== 'param')]
    : Object.keys(dataset).filter((k) => k !== 'param')
  for (const key of keys) {
    const rows = datasetRowsOf(dataset[key])
    if (rows) return rows.map((row) => withoutInventedRetailTitles(row))
  }
  return []
}

/** 把工作区明细写进模板的驱动数据集，保留原 type/name 等元数据。 */
export function mergeRowsIntoTemplateDataset (template, rows, opts = {}) {
  if (!template || typeof template !== 'object') return template
  const varName = String(opts.varName || template.datasetVar || firstDatasetVar(template) || 'ds1').trim() || 'ds1'
  const spec = excelDatasetFromRows(rows, { ...opts, varName })[varName]
  const prev = template.dataset && template.dataset[varName]
  const nextSpec = prev && typeof prev === 'object' && !Array.isArray(prev)
    ? { ...prev, type: prev.type || 'EXCEL', fields: spec.fields, data: spec.data }
    : spec
  return {
    ...template,
    datasetVar: template.datasetVar || varName,
    dataset: { ...((template.dataset) || {}), [varName]: nextSpec }
  }
}

function withRetailAliases (items, fields) {
  return (items || []).map((item) => ({
    ...item,
    row: retailAliasFields(item.row, fields)
  }))
}

function widenTextForBoundValue (el, sampleValue, pageWidth) {
  const fontPx = Number.parseFloat(String((el.style && el.style.fontSize) || '')) || 16
  const extra = String(sampleValue ?? '')
  const need = Math.ceil(extra.length * fontPx * 0.72 + fontPx)
  const cur = Number(el.width) || 0
  const x = Number(el.x) || 0
  const maxW = Math.max(cur, (Number(pageWidth) || (x + cur + need)) - x - 8)
  el.width = Math.min(maxW, Math.max(cur, cur + need))
}

function bindBarcodeToField (el, varName, field, sampleValue) {
  el.content = '${' + varName + '.' + field + '}'
  if (el.type !== 'barcode') return
  stripImportedBarcodeGeometry(el)
  el.barcodeDisplayValue = true
  if (looksRetailUpc(sampleValue)) {
    const current = String(el.barcodeFormat || '').toLowerCase()
    if (!current || current === 'code128' || current === 'code39') el.barcodeFormat = 'upca'
  }
}

function placeholderFieldOf (content, varName) {
  const token = String(content || '').match(/\$\{([^}]+)\}/)
  if (!token) return ''
  const parts = token[1].trim().split('.').filter(Boolean)
  if (parts.length < 2) return parts[0] || ''
  if (varName && parts[0] !== varName) return ''
  return parts[parts.length - 1]
}

/** Promote a bound 11–13 digit value to UPC-A. Never downgrade UPC/EAN to Code 128. */
function retargetRetailPlaceholders (elements, varName, items) {
  const sample = sampleBindRow(items)
  for (const el of elements) {
    if (el.type !== 'barcode') continue
    const field = placeholderFieldOf(el.content, varName)
    if (!field) continue
    const value = sample[field]
    if (!looksRetailUpc(value)) continue
    const current = String(el.barcodeFormat || '').toLowerCase()
    if (!current || current === 'code128' || current === 'code39') el.barcodeFormat = 'upca'
    el.barcodeDisplayValue = true
  }
}

function bindStaticLabelFields (elements, varName, items, pageWidth) {
  const sample = sampleBindRow(items)
  const keys = Object.keys(sample)
  const upcField = pickRowField(keys, BARCODE_VALUE_FIELDS)
  for (const el of elements) {
    const content = String(el.content || '')
    if (PLACEHOLDER_IN_CONTENT_RE.test(content)) continue
    if (el.type === 'barcode' || el.type === 'qrcode') {
      if (!upcField) continue
      bindBarcodeToField(el, varName, upcField, sample[upcField])
      continue
    }
    if (el.type !== 'text') continue
    const field = findFieldForLabel(content, keys)
    if (!field) continue
    const trimmed = content.trim()
    const colon = trimmed.search(/[:：]/)
    if (colon >= 0) {
      el.content = `${trimmed.slice(0, colon + 1).replace(/\s*$/, '')} \${${varName}.${field}}`
    } else if (fieldKeyOf(trimmed) === fieldKeyOf(field)) {
      el.content = `\${${varName}.${field}}`
    } else {
      el.content = `${trimmed} \${${varName}.${field}}`
    }
    widenTextForBoundValue(el, sample[field], pageWidth)
  }
}

export function injectExpandedRows (template, items, datasetVar) {
  const varName = datasetVar || firstDatasetVar(template)
  const rows = (items || []).map((item) => ({
    ...(item.row && typeof item.row === 'object' ? item.row : {}),
    _seq: item.seqText,
    _copyIndex: item.copyIndex,
    _key: item.key
  }))
  const prev = template && template.dataset && template.dataset[varName]
  const nextDs = { ...((template && template.dataset) || {}) }
  if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
    nextDs[varName] = { ...prev, data: rows }
  } else {
    nextDs[varName] = rows
  }
  return {
    ...(template || {}),
    printKind: 'label',
    dataset: nextDs
  }
}

/**
 * Copy the label, inject print-job rows into the driver dataset, and turn
 * PDF labels that match Excel column names into `${ds.field}` so each line
 * expands to its own page. Retail UPC artwork stays unless the row has a UPC column.
 */
export function bindJobRowsToLabelTemplate (template, items, datasetVar, opts = {}) {
  const aliased = withRetailAliases(items, opts.fields)
  const elements = ((template && template.elements) || []).map((el) => ({ ...el }))
  const base = { ...(template || {}), elements, printKind: 'label' }
  const varName = datasetVar || labelDriverDatasetVar(base)
  bindStaticLabelFields(
    elements,
    varName,
    aliased,
    template && template.paperSize && template.paperSize.width
  )
  retargetRetailPlaceholders(elements, varName, aliased)
  return injectExpandedRows(base, aliased, varName)
}

export function chargeForPrint (job, mode, rowIndexes) {
  const indexes = resolveRowIndexes(job, rowIndexes)
  let chargePages = 0
  let physicalPages = 0
  const sample = mode === PRINT_MODE_SAMPLE
  for (const i of indexes) {
    const copies = copiesForRow(job.rows[i], job.fields, job.copies)
    if (copies <= 0) continue
    const state = (job.printState && job.printState[String(i)]) || {}
    if (sample) {
      physicalPages += 1
      if ((Number(state.samplePrintedCount) || 0) >= 1) chargePages += 1
    } else {
      physicalPages += copies
      if (!state.productionPrinted) chargePages += copies
    }
  }
  return { chargePages, physicalPages, indexes }
}

export function nextPrintState (job, mode, rowIndexes) {
  const indexes = resolveRowIndexes(job, rowIndexes)
  const printState = { ...(job.printState || {}) }
  const sample = mode === PRINT_MODE_SAMPLE
  for (const i of indexes) {
    const copies = copiesForRow(job.rows[i], job.fields, job.copies)
    if (copies <= 0) continue
    const key = String(i)
    const prev = printState[key] || { samplePrintedCount: 0, productionPrinted: false }
    if (sample) {
      printState[key] = {
        ...prev,
        samplePrintedCount: (Number(prev.samplePrintedCount) || 0) + 1
      }
    } else {
      printState[key] = { ...prev, productionPrinted: true }
    }
  }
  return printState
}

export function matchWarnings (matchResult) {
  const warnings = []
  for (const m of matchResult || []) {
    if (m.status === 'unmatchedPage') {
      warnings.push({ type: 'unmatchedPage', pageRef: m.pageRef, key: m.key })
    } else if (m.status === 'unmatchedRow') {
      warnings.push({ type: 'unmatchedRow', rowIndex: m.rowIndex, key: m.key })
    } else if (m.status === 'zeroCopies') {
      warnings.push({ type: 'zeroCopies', rowIndex: m.rowIndex, key: m.key })
    }
  }
  return warnings
}
