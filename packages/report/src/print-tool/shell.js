// 禁止: ZPL 入口、面板 200–480、空白模板预置 EXCEL
import { CURRENT_REPORT_SCHEMA_VERSION } from '../schema.js'
import { createBlankTemplate, exportTemplate, normalizeDesignerTemplate, refreshGroups } from '../designer/model.js'
import { mountDesigner } from '../designer/designer.js'
import { REPORT_TEMPLATE_API_BASE, templateItemUrl, withStamp } from './api.js'
import { createHttp } from './http.js'
import { PRINT_TOOL_CSS } from './style.js'
import { mountTemplates } from './templates.js'
import { mountParam } from './param.js'
import { hasDatasourcePlugin, mountConnections } from './datasource-ui.js'
import { mountDataset } from './dataset.js'
import { buildPreviewParams, mountPreview } from './preview.js'
import { invalidateTemplatePaperMeta } from './print-agent.js'
import { openPreviewWindow } from './preview-jump.js'
import { downloadBlob, invalidId, promptDlg, toast } from './util.js'
import { ht } from './i18n.js'
import { encodeTemplate, envelopeFileName, parseLoadedContent } from '../protect/templateCodec.js'

const CURRENT_TEMPLATE_ID_KEY = 'current_template_id'

function fire (host, name, detail) {
  host.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }))
}

function rememberTemplateId (host, id) {
  const v = String(id || '').trim()
  if (!v) return
  try { host.ownerDocument.defaultView.localStorage.setItem(CURRENT_TEMPLATE_ID_KEY, v) } catch { /* ignore */ }
}

export function mountPrintTool (host, opts = {}) {
  const doc = host.ownerDocument
  const root = host.shadowRoot || host
  const http = createHttp(opts)
  const templateApi = opts.templateApi || REPORT_TEMPLATE_API_BASE
  let templateId = String(opts.templateId || '')
  let designer = null
  let templatesApi = null
  let paramApi = null
  let datasetApi = null
  let licenseStatus = opts.licenseStatus || { edition: 'free', active: false }

  const style = doc.createElement('style')
  style.textContent = PRINT_TOOL_CSS
  const wrap = doc.createElement('div')
  wrap.className = 'print-designer tk-ui'
  wrap.tabIndex = 0
  wrap.innerHTML = `
    <div class="toolbar"></div>
    <div class="main-content">
      <div class="left-panel" data-side="left" style="width:300px">
        <div class="resize-handle" data-resize="left"></div>
        <div class="tabs">
          <button type="button" class="tab-button active" data-ltab="tpl"></button>
          <button type="button" class="tab-button" data-ltab="comp"></button>
          <button type="button" class="tab-button" data-ltab="prop"></button>
        </div>
        <div class="tab-content">
          <div data-pane="tpl"></div>
          <div data-pane="left" hidden></div>
        </div>
      </div>
      <div class="design-area">
        <div class="coordinate-wrapper"><div class="coordinate-display fixed-coordinates" data-xy></div></div>
        <div class="paper-container"><div class="paper"></div></div>
      </div>
      <div class="right-panel" data-side="right" style="width:300px">
        <div class="resize-handle" data-resize="right"></div>
        <div class="tabs">
          <button type="button" class="tab-button active" data-rtab="param"></button>
          <button type="button" class="tab-button" data-rtab="dataset"></button>
          <button type="button" class="tab-button" data-rtab="conn" hidden></button>
        </div>
        <div class="tab-content">
          <div data-pane="param"></div>
          <div data-pane="dataset" hidden></div>
          <div data-pane="conn" hidden></div>
        </div>
      </div>
    </div>
    <div class="npt-preview" hidden></div>
  `
  root.replaceChildren(style, wrap)

  const bar = wrap.querySelector('.toolbar')
  const paper = wrap.querySelector('.paper')
  const canvasWrap = wrap.querySelector('.design-area')
  const paperBox = wrap.querySelector('.paper-container')
  const leftPane = wrap.querySelector('[data-pane=left]')
  const tplPane = wrap.querySelector('[data-pane=tpl]')
  const paramPane = wrap.querySelector('[data-pane=param]')
  const datasetPane = wrap.querySelector('[data-pane=dataset]')
  const connPane = wrap.querySelector('[data-pane=conn]')
  const connTab = wrap.querySelector('[data-rtab=conn]')
  const showConn = hasDatasourcePlugin(opts.datasourcePlugin)
  if (connTab) connTab.hidden = !showConn
  const previewBox = wrap.querySelector('.npt-preview')

  function paintChrome () {
    const map = { tpl: 'designer.main.tabTemplates', comp: 'designer.main.tabComponents', prop: 'designer.main.tabProperties', param: 'designer.main.tabParam', dataset: 'designer.main.tabDataset', conn: 'designer.main.tabConnections' }
    wrap.querySelectorAll('[data-ltab], [data-rtab]').forEach((b) => {
      const key = map[b.dataset.ltab || b.dataset.rtab]
      if (key) b.textContent = ht(host, key)
    })
  }

  function setLeft (tab) {
    wrap.querySelectorAll('[data-ltab]').forEach((b) => b.classList.toggle('active', b.dataset.ltab === tab))
    tplPane.hidden = tab !== 'tpl'
    leftPane.hidden = tab === 'tpl'
    if (tab === 'comp' || tab === 'prop') designer && designer.setLeftTab(tab)
  }

  function setRight (tab) {
    wrap.querySelectorAll('[data-rtab]').forEach((b) => b.classList.toggle('active', b.dataset.rtab === tab))
    paramPane.hidden = tab !== 'param'
    datasetPane.hidden = tab !== 'dataset'
    connPane.hidden = tab !== 'conn'
  }

  wrap.querySelectorAll('[data-resize]').forEach((handle) => {
    handle.addEventListener('mousedown', (ev) => {
      ev.preventDefault()
      const side = handle.dataset.resize
      const panel = wrap.querySelector('[data-side=' + side + ']')
      const startX = ev.clientX
      const startW = panel.getBoundingClientRect().width
      const move = (e) => {
        const dx = e.clientX - startX
        const w = side === 'left' ? startW + dx : startW - dx
        panel.style.width = Math.max(360, Math.min(600, w)) + 'px'
      }
      const up = () => {
        doc.removeEventListener('mousemove', move)
        doc.removeEventListener('mouseup', up)
      }
      doc.addEventListener('mousemove', move)
      doc.addEventListener('mouseup', up)
    })
  })

  host.addEventListener('error', (ev) => {
    const err = ev.detail
    if (err) toast(host, err.message || String(err), 'err')
  })
  paintChrome()
  wrap.querySelectorAll('[data-ltab]').forEach((b) => b.addEventListener('click', () => setLeft(b.dataset.ltab)))
  wrap.querySelectorAll('[data-rtab]').forEach((b) => b.addEventListener('click', () => setRight(b.dataset.rtab)))

  const preview = mountPreview(host, previewBox, {
    http,
    templateApi,
    getLicenseStatus () { return licenseStatus },
    getTemplate () { return designer ? designer.getTemplate() : createBlankTemplate() }
  })

  function currentTpl () {
    return designer ? designer.getTemplate() : createBlankTemplate()
  }

  function buildSavePayload (id, names) {
    const tpl = currentTpl()
    refreshGroups(tpl)
    const paperH = Number(tpl.paperSize && tpl.paperSize.height) || 0
    const headerY = tpl.headerHeight != null ? Number(tpl.headerHeight) : Number(tpl.headerY)
    const footerY = tpl.footerHeight != null ? paperH - Number(tpl.footerHeight) : Number(tpl.footerY)
    const elements = (tpl.elements || []).map((el) => {
      const cleaned = Object.assign({}, el)
      delete cleaned.selected
      delete cleaned.editing
      Object.keys(cleaned).forEach((key) => { if (key.charAt(0) === '_') delete cleaned[key] })
      if (cleaned.width !== undefined) cleaned.width = Number(cleaned.width) || 0
      if (cleaned.height !== undefined) cleaned.height = Number(cleaned.height) || 0
      if (cleaned.x !== undefined) cleaned.x = Number(cleaned.x) || 0
      if (cleaned.y !== undefined) cleaned.y = Number(cleaned.y) || 0
      if (cleaned.style && cleaned.style.fontSize !== undefined) {
        const n = parseFloat(String(cleaned.style.fontSize).trim())
        cleaned.style.fontSize = isNaN(n) ? 12 : n
      }
      return cleaned
    }).sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x))
    const nameCn = names && names.nameCn != null ? String(names.nameCn).trim() : (tpl.nameCn || '')
    const nameEn = names && names.nameEn != null ? String(names.nameEn).trim() : (tpl.nameEn || '')
    const nameVn = names && names.nameVn != null ? String(names.nameVn).trim() : (tpl.nameVn || '')
    const payload = {
      id,
      schemaVersion: CURRENT_REPORT_SCHEMA_VERSION,
      paperSize: Object.assign({}, tpl.paperSize),
      paperPreset: tpl.paperPreset,
      paperOrientation: tpl.paperOrientation,
      printKind: tpl.printKind === 'label' ? 'label' : 'document',
      summaryEnabled: tpl.printKind === 'label' ? false : tpl.summaryEnabled !== false,
      headerY,
      footerY,
      summaryA: tpl.summaryA,
      summaryB: tpl.summaryB,
      elements,
      param: tpl.param || {},
      dataset: tpl.dataset || {},
      nameCn,
      nameEn,
      nameVn,
      name: nameCn || id,
      createdAt: new Date().toISOString()
    }
    if (tpl.paperPreset === 'CUSTOM') {
      payload.customPaperSize = {
        width: Number(tpl.customPaperSize && tpl.customPaperSize.width) || 1,
        height: Number(tpl.customPaperSize && tpl.customPaperSize.height) || 1
      }
      if (tpl.customPaperSizeMm && tpl.customPaperSizeMm.width > 0 && tpl.customPaperSizeMm.height > 0) {
        payload.customPaperSizeMm = {
          width: Number(tpl.customPaperSizeMm.width),
          height: Number(tpl.customPaperSizeMm.height)
        }
      }
    }
    return payload
  }

  function hasMisplacedSubtotal (tpl) {
    const list = tpl.elements || []
    const paperH = Number(tpl.paperSize && tpl.paperSize.height) || 0
    const headerH = tpl.headerHeight != null ? Number(tpl.headerHeight) : Number(tpl.headerY)
    const footerH = tpl.footerHeight != null ? Number(tpl.footerHeight) : (paperH - Number(tpl.footerY))
    const regionTop = Number.isFinite(Number(tpl.summaryB))
      ? Number(tpl.summaryB)
      : Math.max((Number.isFinite(headerH) ? headerH : 0) + 2, paperH - (Number.isFinite(footerH) ? footerH : 60) - 100)
    const regionBottom = paperH - (Number.isFinite(footerH) ? footerH : 60)
    if (!Number.isFinite(regionTop) || !Number.isFinite(regionBottom)) return false
    return list.some((el) => {
      if (!el || !el.content || !/\$\{\s*subtotal\s*\([^}]*\)\s*\}/i.test(el.content)) return false
      const y = el.y || 0
      return y >= regionTop && y < regionBottom
    })
  }

  async function saveAs (name, names) {
    const id = String(name || '').trim()
    if (!id) return toast(host, ht(host, 'designer.messages.idRequired'), 'err')
    if (invalidId(id)) return toast(host, ht(host, 'designer.messages.idInvalidChars'), 'err')
    const tpl = currentTpl()
    if (hasMisplacedSubtotal(tpl)) toast(host, ht(host, 'designer.canvas.subtotalNotAllowedInSummaryB'))
    const payload = buildSavePayload(id, names)
    await http.put(templateItemUrl(templateApi, id), { content: JSON.stringify(payload, null, 2) })
    invalidateTemplatePaperMeta(id)
    templateId = id
    rememberTemplateId(host, id)
    if (templatesApi) templatesApi.setActive(id)
    if (templatesApi) templatesApi.reload()
    toast(host, ht(host, 'designer.messages.saved', { id }), 'ok')
    fire(host, 'save', { template: payload, id })
  }

  async function onSave () {
    const tpl = currentTpl()
    if (!(tpl.elements && tpl.elements.length)) {
      return toast(host, ht(host, 'designer.messages.noElementsToSave'), 'err')
    }
    const form = await promptDlg(host, ht(host, 'designer.template.saveTitle'), [
      { key: 'id', label: ht(host, 'designer.template.codeLabel'), value: templateId || tpl.id || '', placeholder: ht(host, 'designer.template.codePlaceholder') },
      { key: 'nameCn', label: ht(host, 'designer.template.nameCn'), value: tpl.nameCn || tpl.name || '', placeholder: ht(host, 'designer.template.nameCnPlaceholder') },
      { key: 'nameEn', label: ht(host, 'designer.template.nameEn'), value: tpl.nameEn || '', placeholder: ht(host, 'designer.template.nameEnPlaceholder') },
      { key: 'nameVn', label: ht(host, 'designer.template.nameVn'), value: tpl.nameVn || '', placeholder: ht(host, 'designer.template.nameVnPlaceholder') }
    ], { requireKeys: ['id'] })
    if (!form) return
    try { await saveAs(form.id, form) } catch (err) { toast(host, '保存失败：' + (err.message || err), 'err') }
  }

  async function loadId (id) {
    const data = await http.get(withStamp(templateItemUrl(templateApi, id)))
    if (!data || !data.content) throw new Error('模板内容为空')
    const raw = await parseLoadedContent(String(data.content).replace(/^\uFEFF/, ''))
    const tpl = JSON.parse(raw)
    if (!tpl.id) tpl.id = id
    templateId = id
    rememberTemplateId(host, id)
    designer.setTemplate(normalizeDesignerTemplate(tpl))
    if (templatesApi) templatesApi.setActive(id)
    if (paramApi) paramApi.paint()
    if (datasetApi) datasetApi.paint()
    fire(host, 'template-change', { template: exportTemplate(tpl), id })
  }

  async function onToolbar (act) {
    if (act === 'save') return onSave()
    if (act === 'preview' || act === 'print' || act === 'pdfjump' || act === 'frontend-print' || act === 'pdf-print' || act === 'frontend-jump' || act === 'pdf-jump') {
      const built = buildPreviewParams(currentTpl(), templateId, opts.getAuthHeaders)
      if (!built.ok) {
        if (built.reason === 'noTemplate') return toast(host, ht(host, 'designer.messages.saveBeforePreview'))
        if (built.reason === 'emptyParams') {
          setRight('param')
          return toast(host, ht(host, 'designer.preview.paramsMissing', { names: built.empty.join('、') }))
        }
        return
      }
      if (act === 'frontend-print') {
        return preview.open(built.flat, { allowPrint: true, kind: 'html' })
      }
      if (act === 'preview' || act === 'print' || act === 'pdf-print') {
        return preview.open(built.flat, { allowPrint: true, allowExport: true, kind: 'pdf' })
      }
      if (act === 'frontend-jump') {
        try {
          openPreviewWindow(Object.assign({}, built.flat, { showPrintButton: true }), opts.previewHtmlPath || '/designer/preview-embedded')
        } catch (err) {
          toast(host, err.message || String(err), 'err')
        }
        return
      }
      if (act === 'pdfjump' || act === 'pdf-jump') {
        try {
          openPreviewWindow(Object.assign({}, built.flat, { showPrintButton: true }), opts.previewPdfPath || '/designer/preview')
        } catch (err) {
          toast(host, err.message || String(err), 'err')
        }
      }
    }
  }

  designer = mountDesigner(host, {
    template: opts.template || createBlankTemplate(),
    skipRight: true,
    extraToolbarHtml: '',
    onToolbarClick: onToolbar,
    shell: { wrap, bar, leftPane, paper, canvasWrap, paperBox, style: null }
  })

  let lastHadSel = false
  host.addEventListener('select', (ev) => {
    const ids = (ev.detail && ev.detail.ids) || []
    const has = ids.length > 0
    if (has) setLeft('prop')
    else if (lastHadSel) setLeft('tpl')
    lastHadSel = has
  })

  host.addEventListener('load-template', (ev) => {
    const id = ev.detail && ev.detail.id
    if (id) loadId(id).catch((err) => toast(host, err.message || String(err), 'err'))
  })

  templatesApi = mountTemplates(host, tplPane, {
    http,
    templateApi,
    isAdmin: () => !opts.isAdmin || opts.isAdmin(),
    storagePlugin: opts.storagePlugin,
    onSelect (id) { loadId(id).catch((err) => toast(host, err.message || String(err), 'err')) },
    onSave,
    async onExport () {
      const tpl = currentTpl()
      if (!(tpl.elements && tpl.elements.length)) {
        return toast(host, ht(host, 'report.template.noCurrentTemplate'))
      }
      if (templatesApi) templatesApi.setExportBusy(true)
      try {
        const payload = buildSavePayload(templateId || tpl.id)
        const fileId = payload.id || ('template-' + Date.now())
        payload.createdAt = payload.createdAt || new Date().toISOString()
        if (templateId) {
          try {
            const url = String(templateApi).replace(/\/+$/, '') + '/export/batch'
            const blob = await http.post(url, [fileId], { responseType: 'blob' })
            downloadBlob(blob instanceof Blob ? blob : new Blob([blob]), envelopeFileName(fileId))
            return
          } catch {
            toast(host, ht(host, 'designer.messages.exportFailedUseLocal'))
          }
        }
        downloadBlob(new Blob([await encodeTemplate(payload)], { type: 'application/octet-stream' }), envelopeFileName(fileId))
      } finally {
        if (templatesApi) templatesApi.setExportBusy(false)
      }
    }
  })

  paramApi = mountParam(host, paramPane, {
    getParam () { return designer.getParam() },
    setParam (p) { designer.setParam(p) }
  })

  datasetApi = mountDataset(host, datasetPane, {
    http,
    datasourcePlugin: opts.datasourcePlugin,
    isAdmin: () => !opts.isAdmin || opts.isAdmin(),
    getDataset () { return designer.getData() },
    setDataset (ds, silent) { designer.setData(ds, silent) },
    getParam () { return designer.getParam() },
    setParam (p, silent) {
      designer.setParam(p, silent)
      if (paramApi) paramApi.paint()
    },
    insertField (field) { return designer.insertField(field) }
  })

  if (showConn) {
    mountConnections(host, connPane, {
      datasourcePlugin: opts.datasourcePlugin,
      onChange () {
        if (datasetApi && datasetApi.invalidateConnections) datasetApi.invalidateConnections()
      }
    })
  }

  wrap.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
      ev.preventDefault()
      onSave()
    }
  })

  try {
    const q = new URL(host.ownerDocument.defaultView.location.href).searchParams
    if (q.get('fullscreen') === 'true' && q.get('mode')) {
      const mode = q.get('mode')
      q.delete('mode')
      const next = new URL(host.ownerDocument.defaultView.location.href)
      next.search = q.toString()
      host.ownerDocument.defaultView.history.replaceState({}, '', next.toString())
      loadId(mode).catch((err) => toast(host, err.message || String(err), 'err'))
    }
  } catch { /* 无 location 时跳过深链 */ }

  fire(host, 'ready', { template: designer.getTemplate() })

  return {
    getTemplate () { return designer.getTemplate() },
    setTemplate (tpl) { designer.setTemplate(tpl) },
    getData () { return designer.getData() },
    setData (ds) { designer.setData(ds) },
    undo () { designer.undo() },
    redo () { designer.redo() },
    save: onSave,
    preview () { return onToolbar('preview') },
    async loadTemplate (id) { await loadId(id) },
    setLicenseStatus (status) {
      licenseStatus = status && typeof status === 'object' ? status : { edition: 'free', active: false }
    },
    destroy () {
      if (designer && designer.destroy) designer.destroy()
    }
  }
}
