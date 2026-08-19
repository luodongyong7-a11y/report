import { ht } from './i18n.js'
import { bindOverlayEscape, confirmDlg, toast } from './util.js'

function esc (s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

export function hasDatasourcePlugin (p) {
  return !!(p && typeof p.list === 'function')
}

export function canManageDatasource (p) {
  return hasDatasourcePlugin(p) &&
    typeof p.drivers === 'function' &&
    typeof p.save === 'function' &&
    typeof p.test === 'function' &&
    typeof p.remove === 'function' &&
    typeof p.setDefault === 'function'
}

function emptyConn (dialect) {
  return { originalId: '', id: '', name: '', dialect: dialect || 'postgres', jdbcUrl: '', username: '', password: '', default: false }
}

function draftFromConn (c) {
  return {
    originalId: c.id,
    id: c.id,
    name: c.name || '',
    dialect: c.dialect || 'postgres',
    jdbcUrl: c.jdbcUrl || '',
    username: c.username || '',
    password: '',
    default: !!c.default
  }
}

function payloadOf (draft) {
  return {
    id: draft.id,
    name: draft.name,
    dialect: draft.dialect,
    jdbcUrl: draft.jdbcUrl,
    username: draft.username,
    password: draft.password,
    default: draft.default
  }
}

async function openConnectionForm (host, plugin, drivers, initial) {
  const root = host.shadowRoot || host
  const mask = host.ownerDocument.createElement('div')
  mask.className = 'el-overlay npt-mask'
  let draft = initial
  let error = ''
  let saved = false

  function paint () {
    const driverOpts = drivers.map((d) =>
      '<option value="' + esc(d.dialect) + '"' + (draft.dialect === d.dialect ? ' selected' : '') + '>' + esc(d.id) + ' / ' + esc(d.dialect) + '</option>'
    ).join('')
    const example = ((drivers.find((d) => d.dialect === draft.dialect) || {}).urlExample) || ''
    const title = draft.originalId
      ? ht(host, 'reportDesigner.dataset.connectionsTitle')
      : ht(host, 'reportDesigner.dataset.newConnection')
    mask.innerHTML =
      '<div class="conn-dialog"><div class="el-dialog">' +
      '<div class="el-dialog__header"><span class="el-dialog__title">' + esc(title) + '</span></div>' +
      '<div class="el-dialog__body"><div class="modal-body">' +
      '<div class="conn-form"><div class="meta-grid">' +
      '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.connId')) + '</label><input data-f="id" value="' + esc(draft.id) + '"' + (draft.originalId ? ' disabled' : '') + ' placeholder="erp"></div>' +
      '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.connName')) + '</label><input data-f="name" value="' + esc(draft.name) + '"></div>' +
      '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.connDialect')) + '</label><select data-f="dialect">' + driverOpts + '</select></div>' +
      '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.connUser')) + '</label><input data-f="username" value="' + esc(draft.username) + '"></div>' +
      '</div>' +
      '<div class="form-row"><label>JDBC URL</label><input data-f="jdbcUrl" value="' + esc(draft.jdbcUrl) + '" placeholder="' + esc(example) + '"></div>' +
      '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.connPassword')) + '</label><input data-f="password" type="password" value="' + esc(draft.password) + '" placeholder="' + esc(ht(host, 'reportDesigner.dataset.connPasswordPlaceholder')) + '"></div>' +
      '<label class="check-row"><input data-f="default" type="checkbox"' + (draft.default ? ' checked' : '') + '><span>' + esc(ht(host, 'reportDesigner.dataset.setDefault')) + '</span></label>' +
      (error ? '<p class="error-text">' + esc(error) + '</p>' : '') +
      '</div></div></div>' +
      '<div class="el-dialog__footer">' +
      '<button type="button" class="el-button el-button--default" data-act="test">' + esc(ht(host, 'reportDesigner.dataset.connTest')) + '</button>' +
      '<button type="button" class="el-button el-button--default" data-act="cancel">' + esc(ht(host, 'cancel')) + '</button>' +
      '<button type="button" class="el-button el-button--primary" data-act="save">' + esc(ht(host, 'save')) + '</button>' +
      '</div></div></div>'
    mask.querySelectorAll('[data-f]').forEach((el) => {
      el.addEventListener('input', () => {
        if (el.type === 'checkbox') draft[el.dataset.f] = el.checked
        else draft[el.dataset.f] = el.value
      })
      el.addEventListener('change', () => {
        if (el.dataset.f === 'dialect') {
          draft.dialect = el.value
          paint()
        }
      })
    })
  }

  let unbindEsc = () => {}
  const drop = () => {
    unbindEsc()
    mask.remove()
  }
  mask.addEventListener('click', async (ev) => {
    const actBtn = ev.target.closest('[data-act]')
    const act = actBtn ? actBtn.dataset.act : ''
    if (ev.target === mask || act === 'cancel') {
      drop()
      return
    }
    if (act === 'test') {
      error = ''
      try {
        await plugin.test(payloadOf(draft))
        toast(host, ht(host, 'reportDesigner.dataset.connTestOk'), 'ok')
      } catch (err) {
        error = err.message || String(err)
      }
      paint()
      return
    }
    if (act === 'save') {
      error = ''
      try {
        await plugin.save(payloadOf(draft))
        saved = true
        drop()
      } catch (err) {
        error = err.message || String(err)
        paint()
      }
    }
  })
  root.appendChild(mask)
  unbindEsc = bindOverlayEscape(host, mask, drop)
  paint()
  return new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      if (!mask.isConnected) {
        obs.disconnect()
        resolve(saved)
      }
    })
    obs.observe(root, { childList: true })
  })
}

export function mountConnections (host, pane, ctx) {
  const plugin = ctx.datasourcePlugin
  const manage = canManageDatasource(plugin)
  let connections = []
  let drivers = []

  function notify () {
    if (typeof ctx.onChange === 'function') ctx.onChange()
  }

  function paint () {
    const scroller = pane.querySelector('.data-panel')
    const keepY = scroller ? scroller.scrollTop : 0
    let html = '<div class="data-panel" tabindex="-1"><div class="panel-content">'
    if (manage) {
      html += '<div class="ds-item new-dataset-card" data-act="new"><div class="ds-item-header"><div class="ds-title"><span class="ds-name">' + esc(ht(host, 'reportDesigner.dataset.addConnectionCard')) + '</span><span class="ds-badges"><span class="badge">JDBC</span></span></div><div class="ds-meta"><span class="chev">▸</span></div></div></div>'
    }
    if (connections.length) {
      html += '<div class="ds-list">'
      for (const c of connections) {
        html += '<div class="ds-item" data-id="' + esc(c.id) + '">'
        html += '<div class="ds-item-header"><div class="ds-title"><span class="ds-name">' + esc(c.name || c.id) + '</span>'
        html += '<span class="ds-badges"><span class="badge">' + esc(c.dialect || '') + '</span>'
        html += '<span class="badge muted">' + esc(c.id) + '</span>'
        if (c.default) html += '<span class="badge">' + esc(ht(host, 'reportDesigner.dataset.defaultBadge')) + '</span>'
        html += '</span></div></div>'
        html += '<div class="ds-body">'
        html += '<div class="tiny-text">' + esc(c.jdbcUrl || '') + '</div>'
        if (manage) {
          html += '<div class="ds-meta">'
          html += '<button type="button" class="link-btn" data-act="edit">' + esc(ht(host, 'edit')) + '</button>'
          html += '<button type="button" class="link-btn" data-act="default"' + (c.default ? ' disabled' : '') + '>' + esc(ht(host, 'reportDesigner.dataset.setDefault')) + '</button>'
          html += '<button type="button" class="link-btn danger" data-act="remove">' + esc(ht(host, 'remove')) + '</button>'
          html += '</div>'
        }
        html += '</div></div>'
      }
      html += '</div>'
    } else {
      html += '<div class="no-data"><p>' + esc(ht(host, 'reportDesigner.dataset.noConnections')) + '</p></div>'
    }
    html += '</div></div>'
    pane.innerHTML = html
    const next = pane.querySelector('.data-panel')
    if (next && keepY) next.scrollTop = keepY
  }

  async function reload () {
    try {
      const jobs = [plugin.list()]
      if (manage && !drivers.length) jobs.push(plugin.drivers())
      const out = await Promise.all(jobs)
      connections = Array.isArray(out[0]) ? out[0] : []
      if (out[1] && Array.isArray(out[1])) drivers = out[1]
    } catch (err) {
      connections = []
      toast(host, err.message || String(err), 'err')
    }
    paint()
  }

  pane.addEventListener('click', async (ev) => {
    const actBtn = ev.target.closest('[data-act]')
    const act = actBtn && pane.contains(actBtn) ? actBtn.dataset.act : ''
    if (act === 'new' || ev.target.closest('.new-dataset-card')) {
      if (!manage) return
      const draft = emptyConn(drivers[0] && drivers[0].dialect)
      draft.default = connections.length === 0
      const ok = await openConnectionForm(host, plugin, drivers, draft)
      if (ok) {
        await reload()
        notify()
      }
      return
    }
    const card = ev.target.closest('[data-id]')
    if (!card || !pane.contains(card)) return
    const id = card.dataset.id
    const cur = connections.find((x) => x.id === id)
    if (!cur) return
    if (act === 'default') {
      try {
        await plugin.setDefault(id)
        await reload()
        notify()
      } catch (err) {
        toast(host, err.message || String(err), 'err')
      }
      return
    }
    if (act === 'remove') {
      const ok = await confirmDlg(host, ht(host, 'reportDesigner.dataset.confirmDeleteConnection', { name: cur.name || id }))
      if (!ok) return
      try {
        await plugin.remove(id)
        await reload()
        notify()
      } catch (err) {
        toast(host, err.message || String(err), 'err')
      }
      return
    }
    if (act === 'edit' || !act) {
      if (!manage) return
      const ok = await openConnectionForm(host, plugin, drivers, draftFromConn(cur))
      if (ok) {
        await reload()
        notify()
      }
    }
  })

  paint()
  void reload()
  return { paint, reload }
}
