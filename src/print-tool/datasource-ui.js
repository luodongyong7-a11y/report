import { ht } from './i18n.js'
import { toast } from './util.js'

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

export async function openDatasourceDialog (host, plugin) {
  if (!canManageDatasource(plugin)) return false
  const root = host.shadowRoot || host
  const mask = host.ownerDocument.createElement('div')
  mask.className = 'el-overlay npt-mask'
  let connections = []
  let drivers = []
  let editing = false
  let draft = emptyConn()
  let error = ''
  let changed = false

  try {
    const [list, drv] = await Promise.all([plugin.list(), plugin.drivers()])
    connections = Array.isArray(list) ? list : []
    drivers = Array.isArray(drv) ? drv : []
  } catch (err) {
    toast(host, err.message || String(err), 'err')
    return false
  }

  function payload () {
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

  async function reload () {
    connections = await plugin.list()
    if (!Array.isArray(connections)) connections = []
    changed = true
  }

  function paint () {
    const cards = connections.map((c) =>
      '<div class="ds-item">' +
      '<div class="ds-item-header"><div class="ds-title"><span class="ds-name">' + esc(c.name || c.id) + '</span>' +
      '<span class="ds-badges"><span class="badge">' + esc(c.dialect) + '</span>' +
      (c.default ? '<span class="badge">' + esc(ht(host, 'reportDesigner.dataset.defaultBadge')) + '</span>' : '') +
      '</span></div><div class="ds-meta">' +
      '<button type="button" class="link-btn" data-act="edit" data-id="' + esc(c.id) + '">' + esc(ht(host, 'edit')) + '</button>' +
      '<button type="button" class="link-btn" data-act="default" data-id="' + esc(c.id) + '"' + (c.default ? ' disabled' : '') + '>' + esc(ht(host, 'reportDesigner.dataset.setDefault')) + '</button>' +
      '<button type="button" class="link-btn danger" data-act="remove" data-id="' + esc(c.id) + '">' + esc(ht(host, 'remove')) + '</button>' +
      '</div></div><div class="tiny-text">' + esc(c.jdbcUrl) + '</div></div>'
    ).join('')
    const driverOpts = drivers.map((d) =>
      '<option value="' + esc(d.dialect) + '"' + (draft.dialect === d.dialect ? ' selected' : '') + '>' + esc(d.id) + ' / ' + esc(d.dialect) + '</option>'
    ).join('')
    const example = ((drivers.find((d) => d.dialect === draft.dialect) || {}).urlExample) || ''
    mask.innerHTML =
      '<div class="l_dialog_lg"><div class="el-dialog">' +
      '<div class="el-dialog__header"><span class="el-dialog__title">' + esc(ht(host, 'reportDesigner.dataset.connectionsTitle')) + '</span></div>' +
      '<div class="el-dialog__body"><div class="modal-body">' +
      '<div class="card-list">' +
      '<button type="button" class="ds-item new-dataset-card" data-act="new">' + esc(ht(host, 'reportDesigner.dataset.newConnection')) + '</button>' +
      (cards || '<div class="tiny-text">' + esc(ht(host, 'reportDesigner.dataset.noConnections')) + '</div>') +
      '</div>' +
      (editing
        ? '<div class="conn-form"><div class="meta-grid">' +
          '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.connId')) + '</label><input data-f="id" value="' + esc(draft.id) + '"' + (draft.originalId ? ' disabled' : '') + ' placeholder="erp"></div>' +
          '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.connName')) + '</label><input data-f="name" value="' + esc(draft.name) + '"></div>' +
          '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.connDialect')) + '</label><select data-f="dialect">' + driverOpts + '</select></div>' +
          '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.connUser')) + '</label><input data-f="username" value="' + esc(draft.username) + '"></div>' +
          '</div>' +
          '<div class="form-row"><label>JDBC URL</label><input data-f="jdbcUrl" value="' + esc(draft.jdbcUrl) + '" placeholder="' + esc(example) + '"></div>' +
          '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.connPassword')) + '</label><input data-f="password" type="password" value="' + esc(draft.password) + '" placeholder="' + esc(ht(host, 'reportDesigner.dataset.connPasswordPlaceholder')) + '"></div>' +
          '<label class="check-row"><input data-f="default" type="checkbox"' + (draft.default ? ' checked' : '') + '><span>' + esc(ht(host, 'reportDesigner.dataset.setDefault')) + '</span></label>' +
          (error ? '<p class="error-text">' + esc(error) + '</p>' : '') +
          '<div class="npt-dlg-act">' +
          '<button type="button" class="el-button el-button--default" data-act="test">' + esc(ht(host, 'reportDesigner.dataset.connTest')) + '</button>' +
          '<button type="button" class="el-button el-button--primary" data-act="save">' + esc(ht(host, 'save')) + '</button>' +
          '<button type="button" class="el-button el-button--default" data-act="cancel">' + esc(ht(host, 'cancel')) + '</button>' +
          '</div></div>'
        : '') +
      '</div></div>' +
      '<div class="el-dialog__footer">' +
      '<button type="button" class="el-button el-button--default" data-k="n">' + esc(ht(host, 'close')) + '</button>' +
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

  mask.addEventListener('click', async (ev) => {
    const actBtn = ev.target.closest('[data-act]')
    const act = actBtn ? actBtn.dataset.act : ''
    if (ev.target === mask || ev.target.closest('[data-k=n]')) {
      mask.remove()
      return
    }
    if (act === 'new') {
      draft = emptyConn(drivers[0] && drivers[0].dialect)
      draft.default = connections.length === 0
      editing = true
      error = ''
      paint()
      return
    }
    if (act === 'edit') {
      const c = connections.find((x) => x.id === actBtn.dataset.id)
      if (!c) return
      draft = {
        originalId: c.id,
        id: c.id,
        name: c.name || '',
        dialect: c.dialect || 'postgres',
        jdbcUrl: c.jdbcUrl || '',
        username: c.username || '',
        password: '',
        default: !!c.default
      }
      editing = true
      error = ''
      paint()
      return
    }
    if (act === 'default') {
      try {
        await plugin.setDefault(actBtn.dataset.id)
        await reload()
        paint()
      } catch (err) {
        toast(host, err.message || String(err), 'err')
      }
      return
    }
    if (act === 'remove') {
      try {
        await plugin.remove(actBtn.dataset.id)
        if (draft.originalId === actBtn.dataset.id || draft.id === actBtn.dataset.id) editing = false
        await reload()
        paint()
      } catch (err) {
        toast(host, err.message || String(err), 'err')
      }
      return
    }
    if (act === 'test') {
      error = ''
      try {
        await plugin.test(payload())
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
        await plugin.save(payload())
        editing = false
        await reload()
      } catch (err) {
        error = err.message || String(err)
      }
      paint()
      return
    }
    if (act === 'cancel') {
      editing = false
      error = ''
      paint()
    }
  })
  mask.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      mask.remove()
    }
  })
  root.appendChild(mask)
  paint()
  return new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      if (!mask.isConnected) {
        obs.disconnect()
        resolve(changed)
      }
    })
    obs.observe(root, { childList: true })
  })
}
