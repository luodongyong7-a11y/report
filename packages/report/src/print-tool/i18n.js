import zhCN from './locales/zh-CN.js'
import enUS from './locales/en-US.js'
import viVN from './locales/vi-VN.js'

function pack (mod) {
  if (!mod || typeof mod !== 'object') return {}
  if (mod.cancel != null || mod.designer != null || mod.reportDesigner != null) return mod
  if (mod.default && typeof mod.default === 'object') return pack(mod.default)
  return mod
}

const MESSAGES = {
  'zh-CN': pack(zhCN),
  'en-US': pack(enUS),
  'vi-VN': pack(viVN)
}

const EXTRA = {
  'zh-CN': {},
  'en-US': {},
  'vi-VN': {}
}

function lookup (bag, key) {
  if (!bag || !key) return undefined
  const parts = String(key).split('.')
  let cur = bag
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return typeof cur === 'string' ? cur : undefined
}

function unescapeVueI18n (s) {
  return String(s)
    .replace(/\{'\{\'\}/g, '{')
    .replace(/\{'\}\'\}/g, '}')
    .replace(/\{'\$'\}/g, '$')
}

export function normalizeLocale (locale) {
  const raw = String(locale || '').trim()
  if (MESSAGES[raw]) return raw
  if (raw.toLowerCase().startsWith('en')) return 'en-US'
  if (raw.toLowerCase().startsWith('vi')) return 'vi-VN'
  return 'zh-CN'
}

export function t (locale, key, params) {
  const loc = normalizeLocale(locale)
  let val = lookup(MESSAGES[loc], key)
  if (val == null) val = EXTRA[loc] && EXTRA[loc][key]
  if (val == null) val = lookup(MESSAGES['en-US'], key)
  if (val == null) val = EXTRA['en-US'] && EXTRA['en-US'][key]
  if (val == null) val = lookup(MESSAGES['zh-CN'], key)
  if (val == null) val = EXTRA['zh-CN'] && EXTRA['zh-CN'][key]
  if (val == null) return ''
  let out = unescapeVueI18n(val)
  if (params && typeof params === 'object') {
    out = out.replace(/\{(\w+)\}/g, (_, name) => (params[name] == null ? '' : String(params[name])))
  }
  return out
}

export function hostLocale (host) {
  return normalizeLocale(host && (host.locale || (host.getAttribute && host.getAttribute('locale'))))
}

export function ht (host, key, params) {
  const out = t(hostLocale(host), key, params)
  return out || ''
}
