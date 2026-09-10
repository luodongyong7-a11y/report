const PREVIEW_META_KEYS = new Set(['showPrintButton', 'autoPrint', 'hideHeader', 'apiParams'])

function coerceShowPrintButton (v) {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v !== 'false' && v !== '0'
  return Boolean(v)
}

function coerceApiParamValue (v) {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'object') return v
  return String(v)
}

export function toApiParamsRecord (params) {
  const nested = params.apiParams
  if (nested != null && typeof nested === 'object' && !Array.isArray(nested)) {
    const out = {}
    for (const [k, v] of Object.entries(nested)) {
      const coerced = coerceApiParamValue(v)
      if (coerced !== undefined) out[k] = coerced
    }
    return out
  }
  const out = {}
  for (const [k, v] of Object.entries(params)) {
    if (PREVIEW_META_KEYS.has(k)) continue
    const coerced = coerceApiParamValue(v)
    if (coerced !== undefined) out[k] = coerced
  }
  return out
}

export function buildSqlPreviewPayloadObject (params) {
  const payload = { apiParams: toApiParamsRecord(params) }
  const printBtn = coerceShowPrintButton(params.showPrintButton)
  if (printBtn !== undefined) payload.showPrintButton = printBtn
  if (params.autoPrint !== undefined && params.autoPrint !== null) {
    payload.autoPrint = params.autoPrint === true || params.autoPrint === 'true' || params.autoPrint === '1'
  }
  if (params.hideHeader !== undefined && params.hideHeader !== null) {
    payload.hideHeader = params.hideHeader === true || params.hideHeader === 'true' || params.hideHeader === '1'
  }
  return payload
}

export function newSqlPreviewKey () {
  return 'tk-sql-preview:' + Date.now() + ':' + Math.random().toString(16).slice(2)
}

function readPreviewPayloadRaw (previewKey) {
  if (!previewKey) return null
  try {
    const fromSession = sessionStorage.getItem(previewKey)
    if (fromSession) return fromSession
  } catch { /* ignore */ }
  try {
    const fromLocal = localStorage.getItem(previewKey)
    if (fromLocal) {
      try { sessionStorage.setItem(previewKey, fromLocal) } catch { /* ignore */ }
      try { localStorage.removeItem(previewKey) } catch { /* ignore */ }
      return fromLocal
    }
  } catch { /* ignore */ }
  return null
}

export function readSqlPreviewSessionPayload (previewKey) {
  const raw = readPreviewPayloadRaw(previewKey)
  if (!raw) return null
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return null
    const ap = o.apiParams
    if (!ap || typeof ap !== 'object' || Array.isArray(ap)) return null
    return o
  } catch {
    return null
  }
}

export function resolvePreviewHref (previewKey, previewPath) {
  const path = previewPath || '/designer/preview'
  return new URL(path + (path.includes('?') ? '&' : '?') + 'previewKey=' + encodeURIComponent(previewKey), window.location.href).href
}

export function openPreviewWindow (params, previewPath) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('openPreviewWindow: params required')
  }
  const payload = buildSqlPreviewPayloadObject(params)
  const previewKey = newSqlPreviewKey()
  const raw = JSON.stringify(payload)
  const href = resolvePreviewHref(previewKey, previewPath)
  try {
    localStorage.setItem(previewKey, raw)
  } catch (e) {
    throw new Error('无法写入预览参数: ' + (e?.message || e))
  }
  const child = window.open(href, '_blank')
  if (!child) {
    try { localStorage.removeItem(previewKey) } catch { /* ignore */ }
    throw new Error('无法打开预览窗口，请允许浏览器弹窗')
  }
  try {
    child.sessionStorage.setItem(previewKey, raw)
  } catch { /* localStorage bridge covers this */ }
  return child
}

export function previewKeyFromLocation (loc) {
  const href = loc || (typeof window !== 'undefined' ? window.location.href : '')
  try {
    return new URL(href).searchParams.get('previewKey') || ''
  } catch {
    return ''
  }
}
