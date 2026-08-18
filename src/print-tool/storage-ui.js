import { ht } from './i18n.js'
import { toast } from './util.js'

function esc (s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

export function hasStoragePlugin (p) {
  return !!(p && typeof p.get === 'function' && typeof p.save === 'function' && typeof p.test === 'function')
}

function emptyDraft () {
  return { type: 'local', endpoint: '', accessKey: '', secretKey: '', bucket: 'report', prefix: 'reports/', secure: false, dataDir: '' }
}

export async function openStorageDialog (host, plugin) {
  if (!hasStoragePlugin(plugin)) return false
  const root = host.shadowRoot || host
  const mask = host.ownerDocument.createElement('div')
  mask.className = 'el-overlay npt-mask'
  let draft = emptyDraft()
  let error = ''
  let saved = false

  try {
    const data = await plugin.get()
    draft = {
      type: data && data.type === 'minio' ? 'minio' : 'local',
      endpoint: (data && data.endpoint) || '',
      accessKey: (data && data.accessKey) || '',
      secretKey: '',
      bucket: (data && data.bucket) || 'report',
      prefix: (data && data.prefix) || 'reports/',
      secure: !!(data && data.secure),
      dataDir: (data && data.dataDir) || ''
    }
  } catch (err) {
    toast(host, err.message || String(err), 'err')
    return false
  }

  function payload () {
    return {
      type: draft.type,
      endpoint: draft.endpoint,
      accessKey: draft.accessKey,
      secretKey: draft.secretKey,
      bucket: draft.bucket,
      prefix: draft.prefix,
      secure: draft.secure
    }
  }

  function paint () {
    const local = draft.type !== 'minio'
    mask.innerHTML =
      '<div class="l_dialog_sm"><div class="el-dialog">' +
      '<div class="el-dialog__header"><span class="el-dialog__title">' + esc(ht(host, 'designer.templatesPanel.storageTitle')) + '</span></div>' +
      '<div class="el-dialog__body"><div class="modal-body">' +
      '<div class="form-row"><label>' + esc(ht(host, 'designer.templatesPanel.storageType')) + '</label>' +
      '<select data-sf="type">' +
      '<option value="local"' + (local ? ' selected' : '') + '>' + esc(ht(host, 'designer.templatesPanel.storageLocal')) + '</option>' +
      '<option value="minio"' + (local ? '' : ' selected') + '>' + esc(ht(host, 'designer.templatesPanel.storageMinio')) + '</option>' +
      '</select></div>' +
      (local
        ? (draft.dataDir
          ? '<div class="form-row"><label>' + esc(ht(host, 'designer.templatesPanel.storageDataDir')) + '</label><input value="' + esc(draft.dataDir) + '" disabled></div>'
          : '')
        : '<div class="form-row"><label>endpoint</label><input data-sf="endpoint" value="' + esc(draft.endpoint) + '" placeholder="127.0.0.1:9000"></div>' +
          '<div class="form-row"><label>accessKey</label><input data-sf="accessKey" value="' + esc(draft.accessKey) + '"></div>' +
          '<div class="form-row"><label>secretKey</label><input data-sf="secretKey" type="password" value="' + esc(draft.secretKey) + '" placeholder="' + esc(ht(host, 'designer.templatesPanel.storageSecretPlaceholder')) + '"></div>' +
          '<div class="form-row"><label>bucket</label><input data-sf="bucket" value="' + esc(draft.bucket) + '"></div>' +
          '<label class="check-row"><input data-sf="secure" type="checkbox"' + (draft.secure ? ' checked' : '') + '><span>HTTPS</span></label>') +
      '<div class="form-row"><label>prefix</label><input data-sf="prefix" value="' + esc(draft.prefix) + '"></div>' +
      (error ? '<p class="error-text">' + esc(error) + '</p>' : '') +
      '</div></div>' +
      '<div class="el-dialog__footer">' +
      '<button type="button" class="el-button el-button--default" data-k="test">' + esc(ht(host, 'designer.templatesPanel.storageTest')) + '</button>' +
      '<button type="button" class="el-button el-button--default" data-k="n">' + esc(ht(host, 'cancel')) + '</button>' +
      '<button type="button" class="el-button el-button--primary" data-k="y">' + esc(ht(host, 'save')) + '</button>' +
      '</div></div></div>'
    mask.querySelectorAll('[data-sf]').forEach((el) => {
      const apply = () => {
        if (el.type === 'checkbox') draft[el.dataset.sf] = el.checked
        else draft[el.dataset.sf] = el.value
      }
      el.addEventListener('input', apply)
      el.addEventListener('change', () => {
        apply()
        if (el.dataset.sf === 'type') paint()
      })
    })
  }

  function close () {
    mask.remove()
  }

  mask.addEventListener('click', async (ev) => {
    if (ev.target === mask || ev.target.closest('[data-k=n]')) {
      close()
      return
    }
    if (ev.target.closest('[data-k=test]')) {
      error = ''
      try {
        await plugin.test(payload())
        toast(host, ht(host, 'designer.templatesPanel.storageTestOk'), 'ok')
      } catch (err) {
        error = err.message || String(err)
      }
      paint()
      return
    }
    if (!ev.target.closest('[data-k=y]')) return
    error = ''
    try {
      await plugin.save(payload())
      saved = true
      close()
      toast(host, ht(host, 'designer.templatesPanel.storageSaved'), 'ok')
    } catch (err) {
      error = err.message || String(err)
      paint()
    }
  })
  mask.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      close()
    }
  })
  root.appendChild(mask)
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
