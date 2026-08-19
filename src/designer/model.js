// 规格: Vue 新建后 dataset 为空对象，禁止预置 EXCEL
import { REPORT_DEFAULT_FONT_SIZE_PX } from '../fontPolicy.js'
import { REPORT_PRESET_PX, inferPaperMetaFromSize } from '../paper.js'
import { assignGroupAndPrevNode } from '../layout/groupPrev.js'
import { resolveBandEdges } from '../layout/bands.js'
import { ensureReportSchemaVersion } from '../schema.js'

const PX_PER_MM = 96 / 25.4
const QR_MIN = 10

const DEFAULT_SIZE = {
  text: { width: 75, height: 18 },
  data: { width: 75, height: 18 },
  image: { width: 75, height: 75 },
  qrcode: { width: 75, height: 75 },
  barcode: { width: 150, height: 37 },
  rect: { width: 80, height: 24 }
}

export function cloneJson (v) {
  return JSON.parse(JSON.stringify(v))
}

export function uid (prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9)
}

export function mmToPx (mm) {
  return Math.round(Number(mm) * PX_PER_MM)
}

export function pxToMm (px) {
  return Math.round((Number(px) / PX_PER_MM) * 100) / 100
}

export function snap (n) {
  return Math.round(Number(n) || 0)
}

export function snapQrcode (el) {
  if (!el || el.type !== 'qrcode') return el
  const s = Math.max(QR_MIN, Math.min(Number(el.width) || QR_MIN, Number(el.height) || QR_MIN))
  el.width = s
  el.height = s
  return el
}

export function defaultBands (h, printKind) {
  if (printKind === 'label') {
    return { headerY: h, summaryA: h, summaryB: h, footerY: h, summaryEnabled: false }
  }
  return {
    headerY: 60,
    headerHeight: 60,
    summaryA: Math.max(62, h - 210),
    summaryB: Math.max(62, h - 160),
    footerY: h - 60,
    footerHeight: 60,
    summaryEnabled: true
  }
}

export function createBlankTemplate (opts = {}) {
  const printKind = opts.printKind === 'label' ? 'label' : 'document'
  const preset = String(opts.paperPreset || 'A4').toUpperCase()
  const dim = REPORT_PRESET_PX[preset] || REPORT_PRESET_PX.A4
  let width = dim.width
  let height = dim.height
  const orient = opts.paperOrientation === 'landscape' ? 'landscape' : 'portrait'
  if (orient === 'landscape') {
    width = dim.height
    height = dim.width
  }
  if (opts.width > 0 && opts.height > 0) {
    width = snap(opts.width)
    height = snap(opts.height)
  }
  const bands = defaultBands(height, printKind)
  return ensureReportSchemaVersion({
    id: opts.id || uid('tpl'),
    name: opts.name || '未命名',
    printKind,
    paperSize: { width, height },
    paperPreset: opts.width ? 'CUSTOM' : preset,
    paperOrientation: orient,
    customPaperSize: { width, height },
    headerY: bands.headerY,
    summaryA: bands.summaryA,
    summaryB: bands.summaryB,
    footerY: bands.footerY,
    summaryEnabled: bands.summaryEnabled,
    elements: [],
    param: {},
    dataset: {}
  })
}

export function normalizeDesignerTemplate (raw) {
  const t = raw && typeof raw === 'object' ? cloneJson(raw) : createBlankTemplate()
  if (!t.paperSize || !(t.paperSize.width > 0)) {
    t.paperSize = { width: 794, height: 1123 }
  }
  if (!Array.isArray(t.elements)) t.elements = []
  if (!t.param || typeof t.param !== 'object' || Array.isArray(t.param)) t.param = {}
  if (!t.dataset || typeof t.dataset !== 'object') t.dataset = {}
  if (t.printKind !== 'label') t.printKind = 'document'
  const meta = inferPaperMetaFromSize(t.paperSize.width, t.paperSize.height)
  if (!t.paperPreset) t.paperPreset = meta.paperPreset
  if (!t.paperOrientation) t.paperOrientation = meta.paperOrientation
  const h = t.paperSize.height
  if (!Number.isFinite(Number(t.headerY))) t.headerY = defaultBands(h, t.printKind).headerY
  if (!Number.isFinite(Number(t.footerY))) t.footerY = defaultBands(h, t.printKind).footerY
  if (!Number.isFinite(Number(t.summaryA))) t.summaryA = defaultBands(h, t.printKind).summaryA
  if (!Number.isFinite(Number(t.summaryB))) t.summaryB = defaultBands(h, t.printKind).summaryB
  if (t.summaryEnabled == null) t.summaryEnabled = t.printKind !== 'label'
  t.elements.forEach(snapQrcode)
  return ensureReportSchemaVersion(t)
}

function clampBandY (v, height) {
  const n = Number(v)
  if (!Number.isFinite(n)) return n
  return Math.max(0, Math.min(n, height))
}

function keepBandsOnPaperChange (tpl, height) {
  const h = Number(height) || 0
  if (!(h > 0)) return
  if (Number.isFinite(Number(tpl.headerY))) {
    tpl.headerY = clampBandY(tpl.headerY, h)
    tpl.headerHeight = tpl.headerY
  }
  if (Number.isFinite(Number(tpl.footerY))) {
    tpl.footerY = clampBandY(tpl.footerY, h)
    tpl.footerHeight = Math.max(0, h - tpl.footerY)
  }
  if (Number.isFinite(Number(tpl.summaryA))) tpl.summaryA = clampBandY(tpl.summaryA, h)
  if (Number.isFinite(Number(tpl.summaryB))) tpl.summaryB = clampBandY(tpl.summaryB, h)
}

export function applyPaperPreset (tpl, preset, orientation) {
  const key = String(preset || 'A4').toUpperCase()
  const dim = REPORT_PRESET_PX[key]
  if (!dim) return tpl
  const landscape = orientation === 'landscape'
  const width = landscape ? dim.height : dim.width
  const height = landscape ? dim.width : dim.height
  tpl.paperPreset = key
  tpl.paperOrientation = landscape ? 'landscape' : 'portrait'
  tpl.paperSize = { width, height }
  tpl.customPaperSize = { width, height }
  keepBandsOnPaperChange(tpl, height)
  return tpl
}

export function applyCustomPaperMm (tpl, widthMm, heightMm, orientation) {
  const wmm = Number(widthMm)
  const hmm = Number(heightMm)
  if (!(wmm > 0 && hmm > 0)) return tpl
  let width = mmToPx(wmm)
  let height = mmToPx(hmm)
  if (orientation === 'landscape' && width < height) {
    const t = width
    width = height
    height = t
  }
  tpl.paperPreset = 'CUSTOM'
  tpl.paperOrientation = orientation === 'landscape' ? 'landscape' : 'portrait'
  tpl.paperSize = { width, height }
  tpl.customPaperSize = { width, height }
  tpl.customPaperSizeMm = { width: wmm, height: hmm }
  keepBandsOnPaperChange(tpl, height)
  return tpl
}

export function applyPrintKind (tpl, kind) {
  tpl.printKind = kind === 'label' ? 'label' : 'document'
  return tpl
}

export function createElement (type, pos, extra) {
  const t = type || 'text'
  const size = DEFAULT_SIZE[t] || DEFAULT_SIZE.text
  const el = {
    id: uid('element'),
    type: t,
    x: snap(pos && pos.x),
    y: snap(pos && pos.y),
    width: size.width,
    height: size.height,
    content: '',
    textAlign: 'center',
    verticalAlign: 'top',
    style: (t === 'text' || t === 'data')
      ? { fontSize: REPORT_DEFAULT_FONT_SIZE_PX }
      : {},
    tolerateNullish: t === 'text' || t === 'data' ? true : undefined
  }
  if (t === 'barcode') {
    el.padding = 0
  }
  if (t === 'qrcode') {
    el.padding = 0
  }
  if (t === 'image') el.padding = 3
  if (t === 'rect') {
    el.style = { backgroundColor: '#000000' }
  }
  if (extra && typeof extra === 'object') Object.assign(el, extra)
  if (t === 'barcode' && !el.barcodeFormat) el.barcodeFormat = 'code128'
  if (t === 'qrcode' && !el.qrcodeFormat) el.qrcodeFormat = 'qrcode'
  snapQrcode(el)
  return el
}

export function stripTransient (el) {
  const o = { ...el }
  delete o.selected
  delete o.editing
  return o
}

export function exportTemplate (tpl) {
  const out = cloneJson(tpl)
  out.elements = (out.elements || []).map(stripTransient)
  return out
}

export function refreshGroups (tpl) {
  const bands = resolveBandEdges(tpl)
  const data = []
  const sbf = []
  for (const el of tpl.elements || []) {
    const y = el.y || 0
    if (tpl.printKind === 'label') {
      el.groupId = el.groupId || null
      continue
    }
    if (y >= bands.headerY && y < bands.summaryA) data.push(el)
    else if (bands.summaryEnabled && y >= bands.summaryB && y < bands.footerY) sbf.push(el)
    else {
      el.groupId = null
      el.prevNodeId = null
    }
  }
  if (data.length) assignGroupAndPrevNode(data, 'group_d')
  if (sbf.length) assignGroupAndPrevNode(sbf, 'group_sbf')
  return tpl
}

export function datasetFields (dataset) {
  const out = []
  if (!dataset || typeof dataset !== 'object') return out
  for (const [name, spec] of Object.entries(dataset)) {
    if (!/^ds\d+$/i.test(name)) continue
    const vn = String(name)
    const fields = spec && Array.isArray(spec.fields) ? spec.fields : []
    if (fields.length) {
      for (const f of fields) {
        if (f) out.push(vn + '.' + String(f).trim())
      }
      continue
    }
    const rows = Array.isArray(spec) ? spec : (spec && Array.isArray(spec.data) ? spec.data : [])
    const first = rows[0]
    if (first && typeof first === 'object') {
      for (const k of Object.keys(first)) out.push(vn + '.' + k)
    }
  }
  return out
}

export function borderWidthOf (el) {
  if (el && el.border) return Number(el.border.width) || 1
  return 0
}
