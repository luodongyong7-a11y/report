import { ht } from './i18n.js'

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

export function toast (host, message, kind) {
  const root = host.shadowRoot || host
  let box = root.querySelector('.npt-toast')
  if (!box) {
    box = host.ownerDocument.createElement('div')
    box.className = 'npt-toast'
    root.appendChild(box)
  }
  box.textContent = message
  box.dataset.kind = kind || 'info'
  box.classList.add('on')
  clearTimeout(box._t)
  box._t = setTimeout(() => box.classList.remove('on'), 2600)
}

export function confirmDlg (host, message) {
  return new Promise((resolve) => {
    const root = host.shadowRoot || host
    const mask = host.ownerDocument.createElement('div')
    mask.className = 'npt-mask'
    mask.innerHTML = '<div class="npt-dlg"><p>' + String(message).replace(/</g, '&lt;') + '</p><div class="npt-dlg-act"><button type="button" data-k="n">' + ht(host, 'cancel') + '</button><button type="button" data-k="y" class="pri">' + ht(host, 'confirm') + '</button></div></div>'
    const close = (ok) => {
      mask.remove()
      resolve(ok)
    }
    mask.addEventListener('click', (ev) => {
      if (ev.target === mask) close(false)
      if (ev.target.dataset.k === 'n') close(false)
      if (ev.target.dataset.k === 'y') close(true)
    })
    root.appendChild(mask)
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
    const close = (ok) => {
      if (!ok) {
        mask.remove()
        resolve(null)
        return
      }
      if (yes.disabled) return
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
      if (ev.key === 'Escape') close(false)
    })
    root.appendChild(mask)
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
