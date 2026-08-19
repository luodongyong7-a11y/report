import { REPORT_TEMPLATE_API_BASE, templateItemUrl, withStamp } from './api.js'
import { ht } from './i18n.js'
import { isPdfFile, pdfToTemplate } from './import-pdf.js'
import { hasStoragePlugin, openStorageDialog } from './storage-ui.js'
import { confirmDlg, promptDlg, toast, downloadBlob, invalidId } from './util.js'

function defaultNameFromFile (fileName) {
  if (!fileName || typeof fileName !== 'string') return ''
  return fileName.replace(/^.*[/\\]/, '').replace(/\.(json|pdf)$/i, '').trim()
}

function emptyTemplate (id) {
  return {
    id,
    paperSize: { width: 794, height: 1123 },
    paperPreset: 'A4',
    paperOrientation: 'portrait',
    printKind: 'document',
    summaryEnabled: true,
    headerY: 60,
    footerY: 1123 - 60,
    summaryA: null,
    summaryB: null,
    elements: [],
    param: {},
    dataset: {}
  }
}

export function mountTemplates (host, pane, ctx) {
  const state = {
    records: [],
    selected: [],
    anchor: -1,
    pageNum: 1,
    pageSize: 30,
    totalPage: 1,
    totalRow: 0,
    loading: false,
    active: '',
    exportBusy: false
  }

  function api () {
    return ctx.templateApi || REPORT_TEMPLATE_API_BASE
  }

  async function load (pageNum) {
    state.loading = true
    if (!state.records.length) paint()
    try {
      const url = withStamp(api() + (String(api()).includes('?') ? '&' : '?') + 'pageNum=' + pageNum + '&pageSize=' + state.pageSize)
      const result = await ctx.http.get(url)
      if (result && Array.isArray(result.records)) {
        state.records = result.records
        state.pageNum = result.pageNum || 1
        state.pageSize = result.pageSize || 30
        state.totalPage = result.totalPage || 1
        state.totalRow = result.totalRow || 0
      } else if (Array.isArray(result)) {
        state.records = result
        state.pageNum = 1
        state.pageSize = 30
        state.totalPage = 1
        state.totalRow = result.length
      } else {
        throw new Error(ht(host, 'designer.templatesPanel.loadFormatError'))
      }
    } catch (err) {
      toast(host, ht(host, 'designer.templatesPanel.loadListFailed', { msg: err.message || err }), 'err')
    } finally {
      state.loading = false
      paint()
    }
  }

  function loadPage (pageNum) {
    if (pageNum >= 1 && pageNum <= state.totalPage) load(pageNum)
  }

  async function allIds () {
    const url = withStamp(api() + (String(api()).includes('?') ? '&' : '?') + 'pageNum=1&pageSize=9999')
    const result = await ctx.http.get(url)
    if (result && Array.isArray(result.records)) return result.records
    if (Array.isArray(result)) return result
    return []
  }

  async function overwriteOk (name) {
    let ids = []
    try { ids = await allIds() } catch { /* 列表失败仍允许继续 */ }
    if (!ids.includes(name)) return true
    return confirmDlg(host, ht(host, 'designer.templatesPanel.overwriteConfirm', { name }))
  }

  const svg = {
    save: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2zm12 2v10H2V3h12zm-3.5 4a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0V7.5a.5.5 0 0 1 .5-.5z"/><path d="M6.5 7a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0V7.5a.5.5 0 0 1 .5-.5z"/><path d="M10 9a.5.5 0 0 1 .5.5v2.5a.5.5 0 0 1-1 0v-3a.5.5 0 0 1 .5-.5z"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>',
    imp: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/></svg>',
    exp: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708.708L8.5 9.293V1.5a.5.5 0 0 0-1 0v7.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>',
    del: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>',
    storage: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v2A1.5 1.5 0 0 1 12.5 7h-9A1.5 1.5 0 0 1 2 5.5v-2zM3.5 3a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5h-9z"/><path d="M2 9.5A1.5 1.5 0 0 1 3.5 8h9A1.5 1.5 0 0 1 14 9.5v2a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-2zM3.5 9a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5h-9z"/></svg>'
  }

  function syncChrome () {
    pane.querySelectorAll('.template-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.id === state.active)
      el.classList.toggle('selected', state.selected.includes(el.dataset.id))
    })
    const del = pane.querySelector('[data-act=del]')
    if (del) del.disabled = state.selected.length === 0
    const exp = pane.querySelector('[data-act=exp]')
    if (exp) {
      exp.disabled = !!state.exportBusy
      exp.innerHTML = state.exportBusy
        ? '<span class="export-btn__spinner" aria-hidden="true"></span>'
        : svg.exp
    }
  }

  function paint () {
    const rows = state.records.map((id, idx) => {
      return '<div class="template-item" data-id="' + String(id).replace(/"/g, '') + '" data-i="' + idx + '" draggable="true"><span class="template-name">' + String(id).replace(/</g, '&lt;') + '</span></div>'
    }).join('')
    const admin = !ctx.isAdmin || ctx.isAdmin()
    pane.innerHTML =
      '<div class="templates-panel">' +
      '<div class="template-actions">' +
      (admin
        ? '<button type="button" class="action-btn save-btn" data-act="save" title="' + ht(host, 'designer.template.saveTitle') + '">' + svg.save + '</button>' +
          '<button type="button" class="action-btn plus-btn" data-act="new" title="' + ht(host, 'designer.templatesPanel.createTitle') + '">' + svg.plus + '</button>' +
          '<button type="button" class="action-btn import-btn" data-act="imp" title="' + ht(host, 'designer.templateIo.importTitle') + '">' + svg.imp + '</button>' +
          '<button type="button" class="action-btn export-btn" data-act="exp" title="' + ht(host, 'report.template.export') + '">' + svg.exp + '</button>' +
          '<button type="button" class="action-btn delete-btn" data-act="del" title="' + ht(host, 'designer.templatesPanel.deleteTitle') + '">' + svg.del + '</button>' +
          (hasStoragePlugin(ctx.storagePlugin)
            ? '<button type="button" class="action-btn storage-btn" data-act="storage" title="' + ht(host, 'designer.templatesPanel.storageTitle') + '">' + svg.storage + '</button>'
            : '') +
          '<input type="file" data-file="imp" accept=".json,.pdf,application/json,application/pdf" style="display:none">'
        : '') +
      '</div>' +
      (rows
        ? '<div class="template-list">' + rows + '</div>'
        : '<div class="no-template"><p>' + (state.loading ? ht(host, 'designer.preview.loading') : ht(host, 'designer.templatesPanel.empty')) + '</p></div>') +
      (state.records.length
        ? '<div class="pagination">' +
          '<button type="button" data-act="prev"' + (state.pageNum <= 1 ? ' disabled' : '') + '>' + ht(host, 'designer.templatesPanel.prevPage') + '</button>' +
          '<span>' + state.pageNum + ' / ' + state.totalPage + '</span>' +
          '<button type="button" data-act="next"' + (state.pageNum >= state.totalPage ? ' disabled' : '') + '>' + ht(host, 'designer.templatesPanel.nextPage') + '</button>' +
          '</div>'
        : '') +
      '</div>'
    syncChrome()
  }

  async function createTemplate () {
    const form = await promptDlg(host, ht(host, 'designer.templatesPanel.createTitle'), [
      { key: 'id', label: ht(host, 'designer.templateIo.nameLabel'), placeholder: ht(host, 'designer.templatesPanel.createPlaceholder') }
    ], { requireKeys: ['id'] })
    if (!form) return
    if (!form.id.trim()) {
      toast(host, ht(host, 'designer.messages.idRequired'))
      return
    }
    const name = form.id.trim()
    if (invalidId(name)) {
      toast(host, ht(host, 'designer.messages.idInvalidChars'))
      return
    }
    if (!(await overwriteOk(name))) return
    try {
      await ctx.http.put(templateItemUrl(api(), name), { content: JSON.stringify(emptyTemplate(name), null, 2) })
      await load(state.pageNum)
      if (typeof ctx.onSelect === 'function') ctx.onSelect(name)
    } catch (err) {
      toast(host, ht(host, 'designer.templatesPanel.createFailed', { msg: err.message || err }), 'err')
    }
  }

  async function importFile (file) {
    let data
    try {
      if (isPdfFile(file)) {
        data = await pdfToTemplate(await file.arrayBuffer())
      } else {
        const parsed = JSON.parse(await file.text())
        data = parsed
        if (data && (data.elements || data.paperSize)) {
          /* 合法对象 */
        } else if (Array.isArray(data)) {
          data = { elements: data }
        } else {
          toast(host, ht(host, 'designer.templateIo.invalidFormat'), 'err')
          return
        }
      }
    } catch (err) {
      toast(host, ht(host, 'designer.templateIo.importError', { msg: err.message }), 'err')
      return
    }
    const form = await promptDlg(host, ht(host, 'designer.templateIo.importTitle'), [
      { key: 'id', label: ht(host, 'designer.templateIo.nameLabel'), value: defaultNameFromFile(file.name), placeholder: ht(host, 'designer.templateIo.namePlaceholder') }
    ], { requireKeys: ['id'] })
    if (!form) return
    if (!form.id.trim()) {
      toast(host, ht(host, 'designer.messages.idRequired'))
      return
    }
    const name = form.id.trim()
    if (invalidId(name)) {
      toast(host, ht(host, 'designer.messages.idInvalidChars'))
      return
    }
    if (!(await overwriteOk(name))) return
    try {
      const payload = Object.assign({}, data, { id: name })
      await ctx.http.put(templateItemUrl(api(), name), { content: JSON.stringify(payload, null, 2) })
      await load(state.pageNum)
      if (typeof ctx.onSelect === 'function') ctx.onSelect(name)
    } catch (err) {
      toast(host, ht(host, 'designer.templatesPanel.saveImportedFailed', { msg: err.message || err }), 'err')
    }
  }

  async function exportSelected () {
    if (!state.selected.length) return
    state.exportBusy = true
    syncChrome()
    try {
      const url = String(api()).replace(/\/+$/, '') + '/export/batch'
      const blob = await ctx.http.post(url, state.selected, { responseType: 'blob' })
      const isSingle = state.selected.length === 1
      const file = isSingle ? state.selected[0] : ('templates_' + Date.now() + '.zip')
      const type = isSingle ? 'application/json' : 'application/zip'
      downloadBlob(blob instanceof Blob ? blob : new Blob([blob], { type }), file)
      state.selected = []
      state.anchor = -1
      toast(host, ht(host, 'report.template.exportSuccess'), 'ok')
    } catch (err) {
      toast(host, ht(host, 'report.template.exportFailed') + ': ' + (err.message || err), 'err')
    } finally {
      state.exportBusy = false
      syncChrome()
    }
  }

  pane.addEventListener('click', async (ev) => {
    const actBtn = ev.target.closest('[data-act]')
    const act = actBtn && pane.contains(actBtn) ? actBtn.dataset.act : ''
    const row = ev.target.closest('[data-id]')
    if (row && !act) {
      const id = row.dataset.id
      const idx = Number(row.dataset.i)
      if (ev.shiftKey && state.anchor !== -1) {
        const start = Math.min(state.anchor, idx)
        const end = Math.max(state.anchor, idx)
        const range = state.records.slice(start, end + 1)
        const set = new Set(state.selected)
        range.forEach((t) => set.add(t))
        state.selected = Array.from(set)
      } else if (ev.ctrlKey || ev.metaKey) {
        if (state.selected.includes(id)) state.selected = state.selected.filter((x) => x !== id)
        else state.selected = state.selected.concat(id)
        state.anchor = idx
      } else {
        state.selected = [id]
        state.anchor = idx
      }
      syncChrome()
      return
    }
    if (act === 'prev') loadPage(state.pageNum - 1)
    if (act === 'next') loadPage(state.pageNum + 1)
    if (act === 'save') ctx.onSave()
    if (act === 'storage') {
      const changed = await openStorageDialog(host, ctx.storagePlugin)
      if (changed) await load(1)
      return
    }
    if (act === 'new') return createTemplate()
    if (act === 'imp') {
      const input = pane.querySelector('[data-file=imp]')
      if (input) input.click()
    }
    if (act === 'exp') {
      if (state.exportBusy) return
      if (state.selected.length) return exportSelected()
      if (typeof ctx.onExport === 'function') ctx.onExport()
    }
    if (act === 'del' && state.selected.length) {
      if (!(await confirmDlg(host, ht(host, 'designer.templatesPanel.deleteConfirm', { count: state.selected.length })))) return
      try {
        const deleted = state.selected.slice()
        await ctx.http.delete(api(), deleted)
        state.selected = []
        state.anchor = -1
        let targetPage = state.pageNum
        const remaining = state.totalRow - deleted.length
        const pageStart = (targetPage - 1) * state.pageSize
        if (remaining > 0 && pageStart >= remaining && targetPage > 1) targetPage -= 1
        await load(targetPage)
      } catch (err) {
        toast(host, ht(host, 'designer.templatesPanel.deleteFailed', { msg: err.message || err }), 'err')
      }
    }
  })

  pane.addEventListener('dblclick', (ev) => {
    const row = ev.target.closest('[data-id]')
    if (!row) return
    if (typeof ctx.onSelect === 'function') ctx.onSelect(row.dataset.id)
  })

  pane.addEventListener('dragstart', (ev) => {
    const row = ev.target.closest('[data-id]')
    if (!row || !ev.dataTransfer) return
    ev.dataTransfer.setData('text/plain', 'template:' + row.dataset.id)
    ev.dataTransfer.setData('tk-dnd-template', '1')
  })

  pane.addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0]
    ev.target.value = ''
    if (!file || ev.target.dataset.file !== 'imp') return
    await importFile(file)
  })

  load(1)

  return {
    reload () { return load(state.pageNum) },
    setActive (id) {
      state.active = id || ''
      syncChrome()
    },
    setExportBusy (busy) {
      state.exportBusy = !!busy
      syncChrome()
    },
    get pagination () {
      return { pageNum: state.pageNum, pageSize: state.pageSize, totalPage: state.totalPage, totalRow: state.totalRow }
    }
  }
}
