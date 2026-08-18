import { REPORT_PRINT_AGENT_DOWNLOAD, REPORT_TEMPLATE_API_BASE, templateItemUrl } from './api.js'
import { readPaperMetaFromTemplate } from '../paper.js'
import { downloadBlob } from './util.js'

const DEFAULT_LOCAL = 'http://127.0.0.1:19290'
const LS_BASE = 'tk-print-agent.baseUrl'
const LS_PRINTER = 'tk-print-agent.preferredPrinter'
const LS_SILENT = 'tk-print-agent.silentEnabled'
const LS_PAPER = 'tk-report.printSettings'
const FORM_SIZE_TOLERANCE_MM = 0.5
const templatePaperMetaCache = new Map()

const PRESET_MM = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  B5: { widthMm: 176, heightMm: 250 }
}

function pxToMm (px) {
  const n = Number(px)
  if (!Number.isFinite(n) || n <= 0) return 0
  return (n * 25.4) / 96
}

export function paperMetaToMm (meta = {}) {
  const preset = String(meta.paperPreset || meta.preset || '').toUpperCase()
  const orient = String(meta.paperOrientation || meta.orientation || 'portrait').toLowerCase()
  let widthMm = Number(meta.widthMm)
  let heightMm = Number(meta.heightMm)
  if (!(widthMm > 0 && heightMm > 0)) {
    if (preset && preset !== 'CUSTOM' && PRESET_MM[preset]) {
      widthMm = PRESET_MM[preset].widthMm
      heightMm = PRESET_MM[preset].heightMm
    } else {
      widthMm = pxToMm(meta.customPaperSize?.width ?? meta.widthPx ?? meta.paperWidth)
      heightMm = pxToMm(meta.customPaperSize?.height ?? meta.heightPx ?? meta.paperHeight)
    }
  }
  if (!(widthMm > 0 && heightMm > 0)) {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_PAPER) || '{}')
      if (Number(saved.widthMm) > 0 && Number(saved.heightMm) > 0) {
        widthMm = Number(saved.widthMm)
        heightMm = Number(saved.heightMm)
      }
    } catch { /* ignore */ }
  }
  if (!(widthMm > 0 && heightMm > 0)) {
    widthMm = 210
    heightMm = 297
  }
  return {
    widthMm,
    heightMm,
    orientation: orient === 'landscape' ? 'landscape' : 'portrait',
    paperPreset: preset || 'CUSTOM'
  }
}

function hasExplicitPaperSize (meta = {}) {
  const widthMm = Number(meta.widthMm)
  const heightMm = Number(meta.heightMm)
  if (widthMm > 0 && heightMm > 0) return true
  const widthPx = Number(meta.customPaperSize?.width ?? meta.widthPx ?? meta.paperWidth)
  const heightPx = Number(meta.customPaperSize?.height ?? meta.heightPx ?? meta.paperHeight)
  return widthPx > 0 && heightPx > 0
}

function readTemplatePaperMeta (detail) {
  const content = typeof detail?.content === 'string'
    ? detail.content
    : (typeof detail?.data?.content === 'string' ? detail.data.content : '')
  if (!content) throw new Error('template content missing')
  const template = JSON.parse(content.replace(/^\uFEFF/, ''))
  const paperSize = template?.paperSize || {}
  return readPaperMetaFromTemplate(template, paperSize.width, paperSize.height)
}

export async function fetchTemplatePaperMeta (http, templateId, templateApi) {
  const id = String(templateId || '').trim()
  if (!id) return null
  const cached = templatePaperMetaCache.get(id)
  if (cached) return cached
  const url = templateItemUrl(templateApi || REPORT_TEMPLATE_API_BASE, id)
  const pending = http.get(url)
    .then(readTemplatePaperMeta)
    .catch((error) => {
      templatePaperMetaCache.delete(id)
      throw error
    })
  templatePaperMetaCache.set(id, pending)
  return pending
}

export function invalidateTemplatePaperMeta (templateId) {
  const id = String(templateId || '').trim()
  if (id) templatePaperMetaCache.delete(id)
  else templatePaperMetaCache.clear()
}

export function getAgentBaseUrl () {
  try {
    const saved = (localStorage.getItem(LS_BASE) || '').trim()
    return saved || DEFAULT_LOCAL
  } catch {
    return DEFAULT_LOCAL
  }
}

export function setAgentBaseUrl (url) {
  try {
    const v = String(url || '').trim().replace(/\/+$/, '')
    if (v) localStorage.setItem(LS_BASE, v)
    else localStorage.removeItem(LS_BASE)
  } catch { /* ignore */ }
}

function normalizeBase (url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

async function fetchJson (url, options = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs ?? 800)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export function isLocalAgentUrl (url) {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://127.0.0.1')
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname)
  } catch {
    return false
  }
}

export async function syncLocalAgentShare (agent) {
  const base = agent?.baseUrl || ''
  if (!base || !isLocalAgentUrl(base)) return false
  if (typeof window === 'undefined' || !window.location?.origin) return false
  const erp = String(window.location.origin).replace(/\/+$/, '')
  try {
    const cfg = await fetchJson(base + '/config', { timeoutMs: 2000 })
    const body = {}
    if (!String(cfg?.erpBaseUrl || '').trim()) body.erpBaseUrl = erp
    if (String(cfg?.bindMode || '').toLowerCase() !== 'lan') {
      body.bindMode = 'lan'
      body.restart = true
    }
    if (!Object.keys(body).length) return false
    await fetch(base + '/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return true
  } catch {
    return false
  }
}

export async function probePrintAgent (preferredBase) {
  const candidates = []
  const preferred = normalizeBase(preferredBase || getAgentBaseUrl())
  if (preferred) candidates.push(preferred)
  if (!candidates.includes(DEFAULT_LOCAL)) candidates.push(DEFAULT_LOCAL)
  for (const base of candidates) {
    try {
      const data = await fetchJson(base + '/health', { timeoutMs: 800 })
      if (data && data.ok) {
        setAgentBaseUrl(base)
        return {
          baseUrl: base,
          machineId: data.machineId || '',
          hostname: data.hostname || '',
          bindMode: data.bindMode || '',
          lanIps: Array.isArray(data.lanIps) ? data.lanIps : [],
          platform: data.platform || '',
          port: data.port
        }
      }
    } catch { /* next */ }
  }
  return null
}

export async function listAgentPrinters (agent) {
  const base = agent?.baseUrl || getAgentBaseUrl()
  const data = await fetchJson(base + '/printers', { timeoutMs: 20000 })
  return Array.isArray(data?.printers) ? data.printers : []
}

export async function listAgentForms (agent, printerName) {
  const base = agent?.baseUrl || getAgentBaseUrl()
  const name = String(printerName || '').trim()
  if (!name) return []
  const data = await fetchJson(base + '/forms?printerName=' + encodeURIComponent(name), { timeoutMs: 20000 })
  return Array.isArray(data?.forms) ? data.forms : []
}

export function getPreferredPrinter () {
  try { return localStorage.getItem(LS_PRINTER) || '' } catch { return '' }
}

export function setPreferredPrinter (name) {
  try {
    if (name) localStorage.setItem(LS_PRINTER, name)
  } catch { /* ignore */ }
}

export function isSilentPrintEnabled () {
  try {
    const v = localStorage.getItem(LS_SILENT)
    if (v == null) return true
    return v === '1' || v === 'true'
  } catch {
    return true
  }
}

export function setSilentPrintEnabled (on) {
  try { localStorage.setItem(LS_SILENT, on ? '1' : '0') } catch { /* ignore */ }
}

function pickPrinter (printers, preferred, matchHint) {
  if (!printers || !printers.length) return ''
  const names = printers.map((p) => p.name).filter(Boolean)
  if (preferred && names.includes(preferred)) return preferred
  if (matchHint) {
    const hint = String(matchHint).toLowerCase()
    const hit = names.find((n) => n.toLowerCase().includes(hint))
    if (hit) return hit
  }
  return names[0] || ''
}

export function isCustomTemplatePaper (meta = {}) {
  return String(meta.paperPreset || meta.preset || '').trim().toUpperCase() === 'CUSTOM'
}

function dimensionsMatch (a, b) {
  return Math.abs(Number(a) - Number(b)) <= FORM_SIZE_TOLERANCE_MM
}

export function formMatchesPaper (form, paper) {
  const width = Number(form?.widthMm)
  const height = Number(form?.heightMm)
  if (!(width > 0 && height > 0 && Number(paper?.widthMm) > 0 && Number(paper?.heightMm) > 0)) return false
  return (
    (dimensionsMatch(width, paper.widthMm) && dimensionsMatch(height, paper.heightMm)) ||
    (dimensionsMatch(width, paper.heightMm) && dimensionsMatch(height, paper.widthMm))
  )
}

function formatFormDimension (value) {
  return String(Math.round(Number(value) * 100) / 100)
}

export function formNameForPaper (paper) {
  return 'TK_' + formatFormDimension(paper.widthMm) + 'x' + formatFormDimension(paper.heightMm)
}

async function writePaperForm (agent, printerName, paper) {
  const formName = formNameForPaper(paper)
  const form = { name: formName, widthMm: paper.widthMm, heightMm: paper.heightMm }
  const res = await fetch(agent.baseUrl + '/apply-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      printerName,
      form,
      orientation: paper.orientation,
      setDefault: false
    })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.ok === false) throw new Error(data?.error || ('HTTP ' + res.status))
  return { formName: data.formName || formName }
}

export async function ensureLocalCustomPaper (agent, printerName, paperMeta = {}) {
  if (!agent || !isLocalAgentUrl(agent.baseUrl)) return { ok: true, skipped: 'remote-agent' }
  if (String(agent.platform || '').toLowerCase() !== 'windows') {
    return { ok: true, skipped: 'non-windows-agent' }
  }
  if (!isCustomTemplatePaper(paperMeta)) return { ok: true, skipped: 'standard-paper' }
  if (!hasExplicitPaperSize(paperMeta)) return { ok: false, error: 'template paper size unavailable' }
  const name = String(printerName || '').trim()
  if (!name) return { ok: false, error: 'printer required' }
  const paper = paperMetaToMm(paperMeta)
  try {
    const forms = await listAgentForms(agent, name)
    const matched = forms.find((form) => formMatchesPaper(form, paper))
    if (matched) return { ok: true, exists: true, formName: matched.name }
    const result = await writePaperForm(agent, name, paper)
    return { ok: true, created: true, formName: result.formName }
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  }
}

export async function printViaAgent (blob, paperMeta = {}, opts = {}) {
  if (!isSilentPrintEnabled()) return false
  const agent = await probePrintAgent(opts.baseUrl)
  if (!agent) return false
  const printers = await listAgentPrinters(agent)
  const printerName = pickPrinter(printers, opts.printerName || getPreferredPrinter(), opts.printerMatch)
  if (!printerName) return false
  setPreferredPrinter(printerName)
  const paper = paperMetaToMm(paperMeta)
  const form = new FormData()
  form.append('file', blob, 'report.pdf')
  form.append('printerName', printerName)
  form.append('widthMm', String(paper.widthMm))
  form.append('heightMm', String(paper.heightMm))
  form.append('orientation', paper.orientation)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90000)
  try {
    const res = await fetch(agent.baseUrl + '/print', { method: 'POST', body: form, signal: ctrl.signal })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) throw new Error(data?.error || ('print failed HTTP ' + res.status))
    return true
  } finally {
    clearTimeout(timer)
  }
}

export function detectClientPlatform () {
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows-x64'
  if (/Mac/i.test(platform) || /Mac OS/i.test(ua)) {
    if (/ARM|aarch64/i.test(ua) || (navigator.userAgentData && navigator.userAgentData.architecture === 'arm')) {
      return 'macos-aarch64'
    }
    return 'macos-x64'
  }
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'linux-x64'
  return 'windows-x64'
}

export async function downloadPrintAgentPackage (http, platform) {
  const plat = platform || detectClientPlatform()
  const blob = await http.get(REPORT_PRINT_AGENT_DOWNLOAD + '?platform=' + encodeURIComponent(plat), {
    responseType: 'blob',
    timeout: 180000
  })
  const file = blob instanceof Blob ? blob : new Blob([blob])
  if (file.type && file.type.includes('application/json')) {
    const text = await file.text()
    let msg = text
    try {
      const j = JSON.parse(text)
      msg = j.message || j.detail || text
    } catch { /* keep */ }
    throw new Error(msg || 'download failed')
  }
  downloadBlob(file, 'tk-print-agent-' + plat + '.zip')
  return true
}

export async function fetchOnlinePrintAgents () {
  const hook = typeof window !== 'undefined' ? window.__TK_FETCH_ONLINE_PRINT_AGENTS__ : null
  if (typeof hook === 'function') {
    try {
      const list = await hook()
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }
  try {
    const res = await fetch('/api/print-agent/online', { credentials: 'include' })
    if (!res.ok) return []
    const data = await res.json()
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.data)) return data.data
    if (Array.isArray(data?.agents)) return data.agents
    return []
  } catch {
    return []
  }
}

export function agentShareUrl (agentOrRow) {
  if (!agentOrRow) return ''
  if (agentOrRow.baseUrl) return normalizeBase(agentOrRow.baseUrl)
  const ip = Array.isArray(agentOrRow.lanIps) ? agentOrRow.lanIps[0] : agentOrRow.lanIp
  const port = agentOrRow.port || 19290
  if (!ip) return ''
  return 'http://' + ip + ':' + port
}
