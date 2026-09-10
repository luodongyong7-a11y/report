import { ht } from './i18n.js'

const OVERLAY_SEL = '.el-overlay.npt-mask, .npt-mask, .npt-preview.el-overlay:not([hidden])'

export function bindOverlayEscape (host, mask, close) {
  const view = (host.ownerDocument && host.ownerDocument.defaultView) || globalThis
  const onKey = (ev) => {
    if (ev.key !== 'Escape' && ev.key !== 'Esc' && ev.keyCode !== 27) return
    if (!mask.isConnected) return
    if (mask.hidden) return
    const root = host.shadowRoot || host
    const list = root.querySelectorAll(OVERLAY_SEL)
    if (list.length && list[list.length - 1] !== mask) return
    ev.preventDefault()
    ev.stopPropagation()
    close()
  }
  view.addEventListener('keydown', onKey, true)
  return () => view.removeEventListener('keydown', onKey, true)
}

export function extractPlaceholders (text) {
  const set = new Set()
  String(text || '').replace(/#\{([^}]+)\}/g, (_, name) => {
    const n = String(name || '').trim()
    if (n) set.add(n)
    return _
  })
  return Array.from(set)
}

export function replacePlaceholders (text, paramMap) {
  return String(text || '').replace(/#\{([^}]+)\}/g, (_, name) => {
    const n = String(name || '').trim()
    if (paramMap instanceof Map) return paramMap.has(n) ? String(paramMap.get(n) ?? '') : ''
    if (paramMap && typeof paramMap === 'object') return String(paramMap[n] ?? '')
    return ''
  })
}

export function flattenObject (obj, prefix, maxDepth, depth) {
  const fields = new Set()
  const p = prefix || ''
  const md = maxDepth == null ? 4 : maxDepth
  const d = depth || 0
  if (!obj || typeof obj !== 'object' || d >= md) return Array.from(fields)
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const next = p ? p + '.' + key : key
    if (Array.isArray(value)) {
      const n = Math.min(value.length, 5)
      for (let i = 0; i < n; i++) {
        const item = value[i]
        if (item && typeof item === 'object') flattenObject(item, next, md, d + 1).forEach((f) => fields.add(f))
      }
    } else if (value && typeof value === 'object') {
      flattenObject(value, next, md, d + 1).forEach((f) => fields.add(f))
    } else {
      fields.add(next)
    }
  }
  return Array.from(fields)
}

export function formatReportSql (sql) {
  if (!sql || !String(sql).trim()) return sql
  const tokens = []
  const protectedSql = String(sql).replace(/[#$]\{[^}]*\}/g, (m) => {
    const s = 'tk_ph_' + tokens.length + '_z'
    tokens.push(m)
    return s
  })
  const keywords = /^(select|from|where|and|or|left|right|inner|outer|join|on|group|by|order|having|limit|offset|insert|into|values|update|set|delete|as|distinct|union|case|when|then|else|end|in|not|null|is|like|between|exists)$/i
  const parts = protectedSql.split(/(\s+|,|\(|\))/).filter((p) => p !== '')
  let indent = 0
  let out = ''
  for (const part of parts) {
    const raw = part
    const word = raw.trim()
    if (!word) {
      continue
    }
    if (word === '(') {
      indent++
      out += '(\n' + '  '.repeat(indent)
      continue
    }
    if (word === ')') {
      indent = Math.max(0, indent - 1)
      out += '\n' + '  '.repeat(indent) + ')'
      continue
    }
    if (word === ',') {
      out += ',\n' + '  '.repeat(indent)
      continue
    }
    const up = keywords.test(word) ? word.toUpperCase() : word
    if (/^(FROM|WHERE|GROUP|ORDER|HAVING|LIMIT|UNION|LEFT|RIGHT|INNER|JOIN)$/i.test(word)) {
      out += '\n' + '  '.repeat(indent) + up + ' '
    } else {
      out += up + (/^\s+$/.test(raw) ? '' : ' ')
    }
  }
  out = out.replace(/tk_ph_(\d+)_z/g, (_, i) => tokens[Number(i)] ?? '')
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function invalidId (name) {
  return /[<>:"/\\|?*]/.test(String(name || ''))
}

export function downloadBlob (blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

const TOAST_ICON = {
  success: '<svg class="el-message__icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm3.2 5.2-3.7 3.7a.5.5 0 0 1-.7 0L4.8 8.9a.5.5 0 0 1 .7-.7l1.65 1.64 3.35-3.34a.5.5 0 1 1 .7.7z"/></svg>',
  error: '<svg class="el-message__icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm2.3 4.7a.5.5 0 0 1 0 .7L8.7 8l1.6 1.6a.5.5 0 1 1-.7.7L8 8.7 6.4 10.3a.5.5 0 1 1-.7-.7L7.3 8 5.7 6.4a.5.5 0 0 1 .7-.7L8 7.3l1.6-1.6a.5.5 0 0 1 .7 0z"/></svg>',
  info: '<svg class="el-message__icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3.2a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6zM7.4 7h1.2v4.6H7.4V7z"/></svg>'
}

export function toast (host, message, kind) {
  const root = host.shadowRoot || host
  const doc = host.ownerDocument
  const k = kind === 'err' ? 'error' : kind === 'ok' ? 'success' : 'info'
  let stack = root.querySelector('.el-message-stack')
  if (!stack) {
    stack = doc.createElement('div')
    stack.className = 'el-message-stack'
    root.appendChild(stack)
  }
  const item = doc.createElement('div')
  item.className = 'el-message el-message--' + k
  item.innerHTML = TOAST_ICON[k] + '<p class="el-message__content"></p><button type="button" class="el-message__closeBtn">×</button>'
  item.querySelector('.el-message__content').textContent = String(message == null ? '' : message)
  const drop = () => {
    item.remove()
    if (stack && !stack.children.length) stack.remove()
  }
  item.querySelector('.el-message__closeBtn').addEventListener('click', drop)
  stack.appendChild(item)
  let timer = setTimeout(drop, k === 'error' ? 8000 : 3000)
  item.addEventListener('mouseenter', () => { clearTimeout(timer) })
  item.addEventListener('mouseleave', () => { timer = setTimeout(drop, 2000) })
}

export function confirmDlg (host, message) {
  return new Promise((resolve) => {
    const root = host.shadowRoot || host
    const mask = host.ownerDocument.createElement('div')
    mask.className = 'npt-mask'
    mask.innerHTML = '<div class="npt-dlg"><p>' + String(message).replace(/</g, '&lt;') + '</p><div class="npt-dlg-act"><button type="button" data-k="n">' + ht(host, 'cancel') + '</button><button type="button" data-k="y" class="pri">' + ht(host, 'confirm') + '</button></div></div>'
    let unbindEsc = () => {}
    const close = (ok) => {
      unbindEsc()
      mask.remove()
      resolve(ok)
    }
    mask.addEventListener('click', (ev) => {
      if (ev.target === mask) close(false)
      if (ev.target.dataset.k === 'n') close(false)
      if (ev.target.dataset.k === 'y') close(true)
    })
    root.appendChild(mask)
    unbindEsc = bindOverlayEscape(host, mask, () => close(false))
  })
}

export function promptDlg (host, title, fields, opts) {
  return new Promise((resolve) => {
    const root = host.shadowRoot || host
    const mask = host.ownerDocument.createElement('div')
    mask.className = 'npt-mask'
    const requireKeys = (opts && opts.requireKeys) || []
    const rows = fields.map((f) => {
      const v = String(f.value || '').replace(/"/g, '&quot;')
      return '<label>' + f.label + '</label><input data-f="' + f.key + '" value="' + v + '"' + (f.placeholder ? ' placeholder="' + f.placeholder.replace(/"/g, '&quot;') + '"' : '') + '>'
    }).join('')
    mask.innerHTML = '<div class="npt-dlg"><h4>' + String(title).replace(/</g, '&lt;') + '</h4><div class="npt-form">' + rows + '</div><div class="npt-dlg-act"><button type="button" data-k="n">' + ht(host, 'cancel') + '</button><button type="button" data-k="y" class="pri">' + ht(host, 'confirm') + '</button></div></div>'
    const yes = mask.querySelector('[data-k=y]')
    const syncDisabled = () => {
      if (!requireKeys.length) return
      yes.disabled = requireKeys.some((k) => {
        const el = mask.querySelector('[data-f="' + k + '"]')
        return !el || !String(el.value || '').trim()
      })
    }
    let unbindEsc = () => {}
    const close = (ok) => {
      if (ok && yes.disabled) return
      unbindEsc()
      if (!ok) {
        mask.remove()
        resolve(null)
        return
      }
      const out = {}
      mask.querySelectorAll('[data-f]').forEach((el) => { out[el.dataset.f] = el.value })
      mask.remove()
      resolve(out)
    }
    mask.addEventListener('click', (ev) => {
      if (ev.target === mask) close(false)
      if (ev.target.dataset.k === 'n') close(false)
      if (ev.target.dataset.k === 'y') close(true)
    })
    mask.addEventListener('input', syncDisabled)
    mask.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') close(true)
    })
    root.appendChild(mask)
    unbindEsc = bindOverlayEscape(host, mask, () => close(false))
    syncDisabled()
    const first = mask.querySelector('input')
    if (first) first.focus()
  })
}

export function previewDatasetPayload (dataset, maxRows) {
  const out = {}
  const cap = Number(maxRows) > 0 ? Number(maxRows) : 20
  for (const [key, value] of Object.entries(dataset || {})) {
    if (key === 'param') continue
    const rows = value && Array.isArray(value.data) ? value.data : (Array.isArray(value) ? value : null)
    if (!rows || !rows.length) continue
    out[key] = rows.slice(0, cap)
  }
  return Object.keys(out).length ? out : null
}

export function emptyTemplate (id) {
  return {
    id,
    paperSize: { width: 794, height: 1123 },
    paperPreset: 'A4',
    paperOrientation: 'portrait',
    headerY: 60,
    footerY: 1063,
    summaryA: null,
    summaryB: null,
    elements: [],
    param: {},
    dataset: {}
  }
}
