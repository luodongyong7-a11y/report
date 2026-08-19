import { licenseIsPro } from '../protect/licenseVerify.js'
import { PRINT_MODE_MANAGE, PRINT_MODE_NORMAL, PRINT_MODE_PREVIEW } from './api.js'
import { ht } from './i18n.js'
import { bindOverlayEscape, previewDatasetPayload, toast } from './util.js'
import { mountPdfViewer } from './pdf-viewer.js'
import { createPreviewShell } from './preview-shell.js'
import { mountPrintSettingsDialog } from './print-settings-ui.js'
import { previewKeyFromLocation, readSqlPreviewSessionPayload } from './preview-jump.js'

export function buildPreviewParams (tpl, templateId, getAuthHeaders) {
  const id = String(templateId || tpl.id || '').trim()
  if (!id) return { ok: false, reason: 'noTemplate' }
  const param = tpl.param && typeof tpl.param === 'object' ? Object.assign({}, tpl.param) : {}
  if (Object.prototype.hasOwnProperty.call(param, 'token')) {
    const headers = typeof getAuthHeaders === 'function' ? (getAuthHeaders() || {}) : {}
    param.token = headers.Authorization || headers['sa-token'] || headers.token || ''
  }
  const empty = Object.keys(param).filter((k) => param[k] == null || String(param[k]).trim() === '')
  if (empty.length) return { ok: false, reason: 'emptyParams', empty }
  const previewDataset = previewDatasetPayload(tpl.dataset)
  return {
    ok: true,
    flat: Object.assign({ templateId: id, printMode: PRINT_MODE_PREVIEW }, param, previewDataset ? { previewDataset } : {})
  }
}

function setBusy (el, on) {
  if (!el) return
  el.disabled = !!on
}

function showStatus (box, text) {
  const body = box.querySelector('[data-preview-body]')
  if (!body) return
  if (body._viewer) {
    body._viewer.destroy()
    body._viewer = null
  }
  body.className = 'inline-report-loading'
  body.setAttribute('data-preview-body', '')
  body.textContent = text
}

const HTML_ZOOM_MIN = 0.5
const HTML_ZOOM_MAX = 3
const HTML_ZOOM_STEP = 0.05
const HTML_ZOOM_WHEEL = 0.03

function extractMountHtml (fullHtml) {
  const raw = String(fullHtml || '')
  if (!raw.trim()) return ''
  try {
    const parsed = new DOMParser().parseFromString(raw, 'text/html')
    const styles = Array.from((parsed.head && parsed.head.querySelectorAll('style')) || []).map((el) => el.outerHTML).join('')
    const root = parsed.querySelector('.report-html-root') || parsed.body
    const inner = root ? root.innerHTML : ''
    return styles + '<div class="report-html-root">' + inner + '</div>'
  } catch {
    return raw
  }
}

function clampHtmlZoom (v) {
  return Math.min(HTML_ZOOM_MAX, Math.max(HTML_ZOOM_MIN, Math.round(v * 1000) / 1000))
}

function showHtml (box, html) {
  const body = box.querySelector('[data-preview-body]')
  if (!body) return
  if (body._viewer) {
    body._viewer.destroy()
    body._viewer = null
  }
  body.className = 'inline-report-viewer npt-html-host preview-body'
  body.setAttribute('data-preview-body', '')
  body.innerHTML =
    '<div class="report-html-shell">' +
    '<div class="report-html-zoombar">' +
    '<button type="button" class="report-html-zoombar__btn" data-html-zoom="-">−</button>' +
    '<span class="report-html-zoombar__label">100%</span>' +
    '<button type="button" class="report-html-zoombar__btn" data-html-zoom="+">+</button>' +
    '</div>' +
    '<div class="report-html-pages">' +
    '<div class="report-html-pages-inner"><div class="report-html-mount"></div></div>' +
    '</div></div>'
  const mount = body.querySelector('.report-html-mount')
  const inner = body.querySelector('.report-html-pages-inner')
  const label = body.querySelector('.report-html-zoombar__label')
  const pages = body.querySelector('.report-html-pages')
  const fragment = extractMountHtml(html)
  const hasContent = !!fragment.trim()
  mount.innerHTML = fragment
  pages.classList.toggle('report-html-pages--empty', !hasContent)
  body.querySelectorAll('[data-html-zoom]').forEach((btn) => { btn.disabled = !hasContent })
  let zoom = 1
  const applyZoom = (next) => {
    if (!hasContent) return
    zoom = clampHtmlZoom(next)
    inner.style.zoom = String(zoom)
    label.textContent = Math.round(zoom * 100) + '%'
  }
  applyZoom(1)
  body.querySelectorAll('[data-html-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyZoom(zoom + (btn.dataset.htmlZoom === '+' ? HTML_ZOOM_STEP : -HTML_ZOOM_STEP))
    })
  })
  pages.addEventListener('wheel', (ev) => {
    if (!ev.ctrlKey && !ev.metaKey) return
    if (!hasContent) return
    ev.preventDefault()
    const magnitude = Math.min(0.06, Math.max(HTML_ZOOM_WHEEL, Math.abs(ev.deltaY) * 0.0012))
    applyZoom(zoom + (ev.deltaY > 0 ? -magnitude : magnitude))
  }, { passive: false })
}

function showViewer (box, blob, onError) {
  const body = box.querySelector('[data-preview-body]')
  if (!body) return null
  if (body._viewer) body._viewer.destroy()
  body.className = 'inline-report-viewer report-pdf-host'
  body.setAttribute('data-preview-body', '')
  body.textContent = ''
  const viewer = mountPdfViewer(body, { onError })
  body._viewer = viewer
  viewer.setBlob(blob)
  return viewer
}

export function mountPreview (host, box, ctx) {
  const shell = createPreviewShell({ http: ctx.http, templateApi: ctx.templateApi, getLicenseStatus: ctx.getLicenseStatus })
  const settings = mountPrintSettingsDialog(host, {
    http: ctx.http,
    getPaperMeta () { return shell.state.paperMeta }
  })

  let unbindEsc = null

  function close () {
    if (unbindEsc) {
      unbindEsc()
      unbindEsc = null
    }
    box.hidden = true
    const body = box.querySelector('[data-preview-body]')
    if (body && body._viewer) {
      body._viewer.destroy()
      body._viewer = null
    }
    shell.reset()
    box.innerHTML = ''
  }

  function actBtn (act, label, extra) {
    return '<button type="button" class="el-button ' + (extra || 'el-button--default') + '" data-act="' + act + '">' + label + '</button>'
  }

  async function open (params, flags) {
    const kind = flags && flags.kind === 'html' ? 'html' : 'pdf'
    const allowPrintFlag = !!(flags && flags.allowPrint === true)
    const allowExportFlag = !!(flags && flags.allowExport === true)
    const printMode = params.printMode === PRINT_MODE_NORMAL || params.printMode === PRINT_MODE_MANAGE
      ? params.printMode
      : PRINT_MODE_PREVIEW
    const canPrintByMode = printMode === PRINT_MODE_NORMAL || printMode === PRINT_MODE_MANAGE
    const showPrint = kind === 'html' ? allowPrintFlag : (canPrintByMode || allowPrintFlag)
    const showExport = kind === 'html' ? true : allowExportFlag
    const showXlsx = showExport && licenseIsPro(ctx.getLicenseStatus && ctx.getLicenseStatus())
    const showSettings = kind === 'pdf'
    box.className = 'npt-preview el-overlay'
    box.hidden = false
    box.innerHTML =
      '<div class="el-overlay-dialog">' +
      '<div class="el-dialog inline-report-dialog">' +
      '<div class="el-dialog__body">' +
      '<div class="inline-report-toolbar">' +
      '<div class="inline-report-toolbar__left"><span class="inline-report-toolbar__title">' + ht(host, 'designer.preview.title') + '</span></div>' +
      '<div class="inline-report-toolbar__actions">' +
      (showSettings ? actBtn('settings', ht(host, 'designer.preview.printSettings')) : '') +
      (showExport ? actBtn('pdf', ht(host, 'designer.preview.downloadPdf')) : '') +
      (showXlsx ? actBtn('xlsx', ht(host, 'designer.preview.downloadExcel')) : '') +
      (showPrint ? actBtn('print', ht(host, 'designer.preview.print'), 'el-button--primary') : '') +
      actBtn('close', ht(host, 'close')) +
      '</div></div>' +
      '<div class="inline-report-loading" data-preview-body>' + ht(host, 'designer.preview.loading') + '</div>' +
      '</div></div></div>'

    const printBtn = box.querySelector('[data-act=print]')
    const pdfBtn = box.querySelector('[data-act=pdf]')
    const xlsxBtn = box.querySelector('[data-act=xlsx]')
    if (printBtn) printBtn.disabled = true
    let armed = false
    let htmlText = ''
    if (unbindEsc) unbindEsc()
    unbindEsc = bindOverlayEscape(host, box, close)
    box.tabIndex = -1
    try { box.focus() } catch { /* ignore */ }

    function syncPrintDisabled () {
      if (!printBtn) return
      printBtn.disabled = kind === 'html' ? !htmlText : !shell.state.previewBlob
    }

    try {
      if (kind === 'html') {
        htmlText = await shell.fetchHtmlPreview(Object.assign({}, params, { printMode: PRINT_MODE_PREVIEW })) || ''
        if (!htmlText) {
          showStatus(box, ht(host, 'designer.preview.noData'))
          toast(host, ht(host, 'designer.preview.noData'))
        } else {
          showHtml(box, htmlText)
        }
      } else {
        const ok = await shell.loadPdfPreview(Object.assign({}, params, { printMode: PRINT_MODE_PREVIEW }))
        if (!ok) {
          showStatus(box, ht(host, 'designer.preview.noData'))
          toast(host, ht(host, 'designer.preview.noData'))
        } else {
          showViewer(box, shell.state.previewBlob, (e) => {
            const msg = e?.message || ht(host, 'designer.preview.loadFailed')
            showStatus(box, msg)
            toast(host, msg, 'err')
            syncPrintDisabled()
          })
        }
      }
    } catch (err) {
      showStatus(box, err.message || ht(host, 'designer.preview.loadFailed'))
      toast(host, err.message || ht(host, 'designer.preview.loadFailed'), 'err')
    }
    syncPrintDisabled()

    box.onclick = async (ev) => {
      const btn = ev.target.closest('[data-act]')
      const act = btn ? btn.dataset.act : ''
      if (act === 'close') return close()
      if (act === 'settings') return settings.open()
      if (act === 'pdf') {
        setBusy(pdfBtn, true)
        try { await shell.downloadPdf(Object.assign({}, params, { printMode: PRINT_MODE_PREVIEW })) } catch (err) {
          toast(host, '下载失败：' + (err.message || err), 'err')
        } finally { setBusy(pdfBtn, false) }
      }
      if (act === 'xlsx') {
        setBusy(xlsxBtn, true)
        try { await shell.downloadXlsx(Object.assign({}, params, { printMode: PRINT_MODE_PREVIEW })) } catch (err) {
          toast(host, '导出失败：' + (err.message || err), 'err')
        } finally { setBusy(xlsxBtn, false) }
      }
      if (act === 'print') {
        if (!showPrint) return
        if (kind === 'html' && !htmlText) return
        if (kind !== 'html' && !shell.state.previewBlob) return
        if (shell.state.printBusy) return
        const printParams = Object.assign({}, params, {
          printMode: kind === 'html' ? PRINT_MODE_PREVIEW : (canPrintByMode ? printMode : PRINT_MODE_PREVIEW)
        })
        setBusy(printBtn, true)
        try {
          let ok = false
          if (kind === 'html') ok = await shell.printHtml(htmlText)
          else if (canPrintByMode && armed) ok = await shell.printFullCached(printParams)
          else {
            ok = await shell.ensureFullAndPrint(printParams)
            if (ok && canPrintByMode) armed = true
          }
          if (!ok) toast(host, ht(host, 'designer.preview.noData'))
        } catch (err) {
          toast(host, err.message || ht(host, 'designer.preview.loadFailed'), 'err')
        } finally { setBusy(printBtn, false) }
      }
    }
  }

  return {
    open,
    close,
    fetchPdf: (params, preview) => shell.fetchPdfBlob(params, preview),
    buildPreviewParams
  }
}

export function mountPreviewPage (host, box, ctx) {
  const shell = createPreviewShell({ http: ctx.http, templateApi: ctx.templateApi, getLicenseStatus: ctx.getLicenseStatus })
  const settings = mountPrintSettingsDialog(host, {
    http: ctx.http,
    getPaperMeta () { return shell.state.paperMeta }
  })
  const kind = ctx.kind === 'html' ? 'html' : 'pdf'
  let htmlText = ''
  let exportApiParams = null
  let showPrint = false
  let canPrintByMode = false
  let sessionPrintMode = PRINT_MODE_PREVIEW
  let armed = false
  let hideHeader = !!ctx.hideHeader

  function paintChrome (opts) {
    const status = opts.status || ht(host, 'designer.preview.loading')
    box.innerHTML =
      '<div class="preview-overlay preview-overlay--page">' +
      (opts.hideHeader ? '' :
        '<div class="preview-header">' +
        '<h2>' + ht(host, 'designer.preview.title') + '</h2>' +
        '<div class="preview-actions">' +
        '<button type="button" class="action-button" data-act="settings">' + ht(host, 'designer.preview.printSettings') + '</button>' +
        (opts.showExport ? '<button type="button" class="action-button" data-act="pdf">' + ht(host, 'designer.preview.downloadPdf') + '</button>' : '') +
        (opts.showXlsx ? '<button type="button" class="action-button" data-act="xlsx">' + ht(host, 'designer.preview.downloadExcel') + '</button>' : '') +
        (opts.showPrint ? '<button type="button" class="action-button action-button--primary" data-act="print">' + ht(host, 'designer.preview.print') + '</button>' : '') +
        '<button type="button" class="action-button" data-act="close">' + ht(host, 'close') + '</button>' +
        '</div></div>') +
      '<div class="inline-report-loading preview-body" data-preview-body>' + status + '</div></div>'
  }

  function closePage () {
    if (kind === 'html' && window.parent && window.parent !== window) {
      try { window.parent.postMessage({ type: 'tk-report-preview-close' }, window.location.origin) } catch { /* ignore */ }
    }
    host.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }))
    window.close()
  }

  async function doPrint () {
    if (!showPrint || !exportApiParams) return false
    if (shell.state.printBusy) return false
    if (kind === 'html') return shell.printHtml(htmlText)
    const printParams = Object.assign({}, exportApiParams, { printMode: canPrintByMode ? sessionPrintMode : PRINT_MODE_PREVIEW })
    let ok = false
    if (canPrintByMode && armed) ok = await shell.printFullCached(printParams)
    else {
      ok = await shell.ensureFullAndPrint(printParams)
      if (ok && canPrintByMode) armed = true
    }
    return ok
  }

  async function start (previewKey, extra) {
    const key = previewKey || previewKeyFromLocation()
    const direct = extra && extra.apiParams && typeof extra.apiParams === 'object' ? extra.apiParams : (ctx.apiParams || null)
    paintChrome({ showExport: false, showXlsx: false, showPrint: false, hideHeader, status: ht(host, 'designer.preview.loading') })
    let payload = null
    if (direct && direct.templateId) {
      payload = { apiParams: direct }
      if (extra) {
        if (extra.showPrintButton !== undefined) payload.showPrintButton = extra.showPrintButton
        if (extra.hideHeader !== undefined) payload.hideHeader = extra.hideHeader
        if (extra.autoPrint !== undefined) payload.autoPrint = extra.autoPrint
      }
    } else if (key) {
      payload = readSqlPreviewSessionPayload(key)
    }
    if (!payload || !payload.apiParams || !payload.apiParams.templateId) {
      showStatus(box, ht(host, 'designer.preview.loadFailed'))
      toast(host, ht(host, 'designer.preview.loadFailed'), 'err')
      return
    }
    const apiParams = payload.apiParams
    sessionPrintMode = apiParams.printMode === PRINT_MODE_NORMAL || apiParams.printMode === PRINT_MODE_MANAGE
      ? apiParams.printMode
      : PRINT_MODE_PREVIEW
    canPrintByMode = sessionPrintMode === PRINT_MODE_NORMAL || sessionPrintMode === PRINT_MODE_MANAGE
    let override
    if (payload.showPrintButton !== undefined && payload.showPrintButton !== null) {
      const p = payload.showPrintButton
      if (typeof p === 'boolean') override = p
      else if (typeof p === 'string') override = p !== 'false' && p !== '0'
      else override = Boolean(p)
    }
    showPrint = canPrintByMode ? override !== false : override === true
    if (payload.hideHeader === true || ctx.hideHeader) hideHeader = true
    const autoPrint = payload.autoPrint === true
    exportApiParams = Object.assign({}, apiParams, { printMode: PRINT_MODE_PREVIEW })
    paintChrome({
      showExport: true,
      showXlsx: licenseIsPro(ctx.getLicenseStatus && ctx.getLicenseStatus()),
      showPrint,
      hideHeader,
      status: ht(host, 'designer.preview.loading')
    })
    armed = false
    htmlText = ''
    try {
      if (kind === 'html') {
        htmlText = await shell.fetchHtmlPreview(Object.assign({}, apiParams, { printMode: PRINT_MODE_PREVIEW })) || ''
        if (!htmlText) {
          showStatus(box, ht(host, 'designer.preview.noData'))
          toast(host, ht(host, 'designer.preview.noData'))
        } else {
          showHtml(box, htmlText)
        }
      } else {
        const ok = await shell.loadPdfPreview(Object.assign({}, apiParams, { printMode: PRINT_MODE_PREVIEW }))
        if (!ok) {
          showStatus(box, ht(host, 'designer.preview.noData'))
          toast(host, ht(host, 'designer.preview.noData'))
        } else {
          const body = box.querySelector('[data-preview-body]')
          body.className = 'preview-pdf-viewer report-pdf-host preview-body'
          body.setAttribute('data-preview-body', '')
          body.textContent = ''
          const viewer = mountPdfViewer(body, {
            onError (e) {
              const msg = e?.message || ht(host, 'designer.preview.loadFailed')
              showStatus(box, msg)
              toast(host, msg, 'err')
            }
          })
          body._viewer = viewer
          viewer.setBlob(shell.state.previewBlob)
        }
      }
    } catch (err) {
      showStatus(box, err.message || ht(host, 'designer.preview.loadFailed'))
      toast(host, err.message || ht(host, 'designer.preview.loadFailed'), 'err')
    }

    box.onclick = async (ev) => {
      const btn = ev.target.closest('[data-act]')
      const act = btn ? btn.dataset.act : ''
      if (act === 'close') return closePage()
      if (act === 'settings') return settings.open()
      if (act === 'pdf') {
        setBusy(btn, true)
        try { await shell.downloadPdf(exportApiParams) } catch (err) {
          toast(host, '下载失败：' + (err.message || err), 'err')
        } finally { setBusy(btn, false) }
      }
      if (act === 'xlsx') {
        setBusy(btn, true)
        try { await shell.downloadXlsx(exportApiParams) } catch (err) {
          toast(host, '导出失败：' + (err.message || err), 'err')
        } finally { setBusy(btn, false) }
      }
      if (act === 'print') {
        setBusy(btn, true)
        try {
          const ok = await doPrint()
          if (!ok) toast(host, ht(host, 'designer.preview.noData'))
        } catch (err) {
          toast(host, err.message || ht(host, 'designer.preview.loadFailed'), 'err')
        } finally { setBusy(btn, false) }
      }
    }

    if (autoPrint && exportApiParams) {
      setTimeout(() => { doPrint().catch(() => {}) }, 60)
    }
  }

  function onMessage (e) {
    if (e.origin !== window.location.origin) return
    if (e.data && e.data.type === 'tk-report-print') doPrint().catch(() => {})
  }

  function onKey (e) {
    if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) closePage()
  }

  window.addEventListener('message', onMessage)
  window.addEventListener('keydown', onKey)

  function refreshLicense () {
    const actions = box.querySelector('.preview-actions')
    if (!actions) return
    const pro = licenseIsPro(ctx.getLicenseStatus && ctx.getLicenseStatus())
    let btn = actions.querySelector('[data-act=xlsx]')
    if (pro && !btn) {
      const doc = host.ownerDocument
      btn = doc.createElement('button')
      btn.type = 'button'
      btn.className = 'action-button'
      btn.dataset.act = 'xlsx'
      btn.textContent = ht(host, 'designer.preview.downloadExcel')
      const pdf = actions.querySelector('[data-act=pdf]')
      const before = pdf && pdf.nextSibling
        ? pdf.nextSibling
        : (actions.querySelector('[data-act=print]') || actions.querySelector('[data-act=close]'))
      if (before) actions.insertBefore(btn, before)
      else actions.appendChild(btn)
    } else if (!pro && btn) {
      btn.remove()
    }
  }

  return {
    start,
    print: doPrint,
    downloadPdf: () => exportApiParams ? shell.downloadPdf(exportApiParams) : Promise.resolve(),
    downloadXlsx: () => exportApiParams ? shell.downloadXlsx(exportApiParams) : Promise.resolve(),
    refreshLicense,
    destroy () {
      window.removeEventListener('message', onMessage)
      window.removeEventListener('keydown', onKey)
    },
    shell
  }
}
