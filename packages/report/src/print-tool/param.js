import { ht } from './i18n.js'
import { bindOverlayEscape, toast } from './util.js'

function esc (s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

const ICON_PLUS = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>'
const ICON_DEL = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>'

export function mountParam (host, pane, ctx) {
  let selected = []
  let anchor = ''

  function param () {
    return ctx.getParam() || {}
  }

  function sanitizeKey (k) {
    return String(k || '').trim()
  }

  function openParamForm (title, draft) {
    return new Promise((resolve) => {
      const root = host.shadowRoot || host
      const mask = host.ownerDocument.createElement('div')
      mask.className = 'npt-mask'
      mask.innerHTML =
        '<div class="npt-dlg l_dialog_sm">' +
        '<h4>' + esc(title) + '</h4>' +
        '<div class="modal-body">' +
        '<div class="form-row"><label>' + esc(ht(host, 'designer.param.nameLabel')) + '</label>' +
        '<input data-f="key" value="' + esc(draft.key || '') + '" placeholder="' + esc(ht(host, 'designer.param.namePlaceholder')) + '"></div>' +
        '<div class="form-row"><label>' + esc(ht(host, 'designer.param.valueLabel')) + '</label>' +
        '<input data-f="value" value="' + esc(draft.value || '') + '" placeholder="' + esc(ht(host, 'designer.param.valuePlaceholder')) + '"></div>' +
        '</div>' +
        '<div class="npt-dlg-act">' +
        '<button type="button" data-k="n">' + esc(ht(host, 'cancel')) + '</button>' +
        '<button type="button" data-k="y" class="pri">' + esc(ht(host, 'save')) + '</button>' +
        '</div></div>'
      const close = (ok) => {
        if (!ok) {
          mask.remove()
          resolve(null)
          return
        }
        const keyEl = mask.querySelector('[data-f=key]')
        const valEl = mask.querySelector('[data-f=value]')
        mask.remove()
        resolve({ key: keyEl ? keyEl.value : '', value: valEl ? valEl.value : '' })
      }
      mask.addEventListener('click', (ev) => {
        if (ev.target === mask || ev.target.dataset.k === 'n') close(false)
        if (ev.target.dataset.k === 'y') close(true)
      })
      mask.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') close(true)
      })
      root.appendChild(mask)
      bindOverlayEscape(host, mask, () => close(false))
      const first = mask.querySelector('input')
      if (first) first.focus()
    })
  }

  function applySelection () {
    pane.querySelectorAll('.kv-row').forEach((row) => {
      row.classList.toggle('selected', selected.includes(row.dataset.k))
    })
    const del = pane.querySelector('[data-act=del]')
    if (del) del.disabled = selected.length === 0
  }

  function paint () {
    const p = param()
    const keys = Object.keys(p)
    const rows = keys.map((k) => {
      const sel = selected.includes(k) ? ' selected' : ''
      const keyText = k || ht(host, 'designer.param.emptyKey')
      return '<div class="kv-row' + sel + '" data-k="' + esc(k) + '" draggable="true">' +
        '<div class="kv-cell kv-key" data-edit="key"><span class="kv-text">' + esc(keyText) + '</span></div>' +
        '<div class="kv-cell kv-value" data-edit="value"><span class="kv-text">' + esc(p[k] ?? '') + '</span></div>' +
        '</div>'
    }).join('')
    pane.innerHTML =
      '<div class="data-panel">' +
      '<div class="panel-content">' +
      '<div class="template-actions">' +
      '<button type="button" class="action-btn plus-btn" data-act="add" title="' + esc(ht(host, 'designer.param.addTitle')) + '">' + ICON_PLUS + '</button>' +
      '<button type="button" class="action-btn delete-btn" data-act="del" title="' + esc(ht(host, 'designer.param.deleteTitle')) + '"' + (selected.length ? '' : ' disabled') + '>' + ICON_DEL + '</button>' +
      '</div>' +
      (rows
        ? '<div class="kv-list">' + rows + '</div>'
        : '<div class="no-data"><p>' + esc(ht(host, 'designer.param.empty')) + '</p></div>') +
      '</div></div>'
  }

  pane.addEventListener('click', async (ev) => {
    const actBtn = ev.target.closest('[data-act]')
    const act = actBtn && pane.contains(actBtn) ? actBtn.dataset.act : ''
    if (act === 'add') {
      const form = await openParamForm(ht(host, 'designer.param.addTitle'), { key: '', value: '' })
      if (!form) return
      const key = sanitizeKey(form.key)
      if (!key) {
        toast(host, ht(host, 'designer.param.nameRequired'))
        return
      }
      const next = Object.assign({}, param())
      if (Object.prototype.hasOwnProperty.call(next, key)) {
        toast(host, ht(host, 'designer.param.nameDuplicate'))
        return
      }
      next[key] = form.value || ''
      selected = [key]
      anchor = key
      ctx.setParam(next)
      paint()
      return
    }
    if (act === 'del') {
      const next = Object.assign({}, param())
      selected.forEach((k) => { delete next[k] })
      selected = []
      anchor = ''
      ctx.setParam(next)
      paint()
      return
    }
    const row = ev.target.closest('[data-k]')
    if (!row) return
    const k = row.dataset.k
    const keys = Object.keys(param())
    if (ev.shiftKey && anchor) {
      const a = keys.indexOf(anchor)
      const b = keys.indexOf(k)
      if (a >= 0 && b >= 0) {
        const start = Math.min(a, b)
        const end = Math.max(a, b)
        selected = Array.from(new Set(selected.concat(keys.slice(start, end + 1))))
      }
    } else if (ev.ctrlKey || ev.metaKey) {
      selected = selected.includes(k) ? selected.filter((x) => x !== k) : selected.concat(k)
      anchor = k
    } else {
      selected = [k]
      anchor = k
    }
    applySelection()
  })

  pane.addEventListener('dblclick', async (ev) => {
    const cell = ev.target.closest('[data-edit]')
    const row = ev.target.closest('[data-k]')
    if (!row || !cell) return
    ev.stopPropagation()
    const k = row.dataset.k
    const form = await openParamForm(ht(host, 'designer.param.editTitle'), {
      key: k,
      value: String(param()[k] ?? '')
    })
    if (!form) return
    const newKey = sanitizeKey(form.key)
    if (!newKey) {
      toast(host, ht(host, 'designer.param.nameRequired'))
      return
    }
    const next = Object.assign({}, param())
    if (newKey !== k && Object.prototype.hasOwnProperty.call(next, newKey)) {
      toast(host, ht(host, 'designer.param.nameDuplicate'))
      return
    }
    if (newKey !== k) delete next[k]
    next[newKey] = form.value
    selected = [newKey]
    anchor = newKey
    ctx.setParam(next)
    paint()
  })

  pane.addEventListener('dragstart', (ev) => {
    const row = ev.target.closest('[data-k]')
    if (!row || !ev.dataTransfer) return
    const k = row.dataset.k
    const keys = (selected.includes(k) ? selected : [k]).map(sanitizeKey).filter(Boolean)
    if (!keys.length) {
      ev.preventDefault()
      return
    }
    ev.dataTransfer.effectAllowed = 'copy'
    ev.dataTransfer.setData('text/plain', keys.join(','))
    ev.dataTransfer.setData('tk-dnd-field', '1')
  })

  paint()
  return { paint }
}
