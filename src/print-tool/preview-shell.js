import { licenseIsPro } from '../protect/licenseVerify.js'
import { PRINT_MODE_PREVIEW, REPORT_HTML_PREVIEW, REPORT_PDF, REPORT_PDF_PREVIEW, REPORT_XLSX } from './api.js'
import { asPdfBlob } from './pdf-blob.js'
import { downloadBlob } from './util.js'
import {
  fetchTemplatePaperMeta,
  isSilentPrintEnabled,
  printViaAgent,
  probePrintAgent
} from './print-agent.js'
import { loadPrintSettings } from './print-settings.js'

export function createPreviewShell (ctx) {
  const http = ctx.http
  const templateApi = ctx.templateApi
  const state = {
    loading: false,
    printBusy: false,
    pdfLoading: false,
    xlsxLoading: false,
    errorMessage: '',
    previewBlob: null,
    paperMeta: null
  }

  let fullPrintBlob = null
  let fullPrintParams = null
  let fullLoadedKey = ''
  let paperMetaTemplateId = ''
  let currentKey = ''
  let printIframe = null
  let printObjectUrl = ''

  function paramsKey (apiParams) {
    if (!apiParams || !apiParams.templateId) return ''
    return JSON.stringify({
      templateId: apiParams.templateId,
      documentId: apiParams.documentId ?? null,
      printMode: apiParams.printMode || 'preview'
    })
  }

  function revokePrintUrl () {
    if (printObjectUrl) {
      window.URL.revokeObjectURL(printObjectUrl)
      printObjectUrl = ''
    }
    if (printIframe) {
      printIframe.remove()
      printIframe = null
    }
  }

  function clearPreview () {
    state.previewBlob = null
  }

  function resetPaperMeta () {
    state.paperMeta = null
    paperMetaTemplateId = ''
  }

  async function fetchPdfBlob (apiParams, preview) {
    if (!apiParams || !apiParams.templateId) return null
    const params = Object.assign({}, apiParams, { printMode: apiParams.printMode || 'preview' })
    const url = preview ? REPORT_PDF_PREVIEW : REPORT_PDF
    const blob = await http.post(url, params, { responseType: 'blob', timeout: 120000 })
    return asPdfBlob(blob)
  }

  async function fetchHtmlPreview (apiParams) {
    if (!apiParams || !apiParams.templateId) return null
    const params = Object.assign({}, apiParams, { printMode: apiParams.printMode || 'preview' })
    const blob = await http.post(REPORT_HTML_PREVIEW, params, { responseType: 'blob', timeout: 120000 })
    if (!blob) return null
    const htmlBlob = blob instanceof Blob ? blob : new Blob([blob], { type: 'text/html' })
    const text = await htmlBlob.text()
    return text && text.trim() ? text : null
  }

  async function resolvePaperMeta (apiParams = {}) {
    const supplied = apiParams.paperMeta
    if (supplied && typeof supplied === 'object' && !Array.isArray(supplied)) {
      paperMetaTemplateId = String(apiParams.templateId || '')
      state.paperMeta = supplied
      return supplied
    }
    const templateId = String(apiParams.templateId || '').trim()
    if (!templateId) return null
    if (paperMetaTemplateId === templateId && state.paperMeta) return state.paperMeta
    try {
      const resolved = await fetchTemplatePaperMeta(http, templateId, templateApi)
      paperMetaTemplateId = templateId
      state.paperMeta = resolved
      return resolved
    } catch {
      return null
    }
  }

  async function loadPdfPreview (apiParams) {
    state.errorMessage = ''
    fullLoadedKey = ''
    fullPrintBlob = null
    fullPrintParams = null
    resetPaperMeta()
    currentKey = paramsKey(Object.assign({}, apiParams, { printMode: 'preview' }))
    if (!apiParams || !apiParams.templateId) {
      clearPreview()
      return false
    }
    state.loading = true
    try {
      clearPreview()
      const [blob] = await Promise.all([
        fetchPdfBlob(Object.assign({}, apiParams, { printMode: apiParams.printMode || 'preview' }), true),
        resolvePaperMeta(apiParams)
      ])
      if (!blob || blob.size === 0) return false
      state.previewBlob = blob
      return true
    } catch (e) {
      clearPreview()
      state.errorMessage = e?.message || String(e)
      throw e
    } finally {
      state.loading = false
    }
  }

  async function fetchFullPrintBlob (apiParams) {
    state.errorMessage = ''
    const key = paramsKey(apiParams)
    if (fullLoadedKey && fullLoadedKey === key && fullPrintBlob) return fullPrintBlob
    if (!apiParams || !apiParams.templateId) return null
    const blob = await fetchPdfBlob(
      Object.assign({}, apiParams, { printMode: apiParams.printMode || 'preview' }),
      false
    )
    if (!blob) return null
    fullPrintBlob = blob
    fullPrintParams = Object.assign({}, apiParams)
    fullLoadedKey = key
    return blob
  }

  function ensurePrintIframe () {
    if (printIframe && printIframe.isConnected) return printIframe
    const iframe = document.createElement('iframe')
    iframe.setAttribute('title', 'report-print')
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0;opacity:0;pointer-events:none;'
    document.body.appendChild(iframe)
    printIframe = iframe
    return iframe
  }

  function waitIframeLoad (iframe, timeoutMs = 8000) {
    return new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve(true)
      }
      const timer = setTimeout(finish, timeoutMs)
      const onLoad = () => {
        clearTimeout(timer)
        iframe.removeEventListener('load', onLoad)
        finish()
      }
      iframe.addEventListener('load', onLoad)
    })
  }

  async function printFrame (prepare) {
    const active = document.activeElement
    revokePrintUrl()
    const iframe = ensurePrintIframe()
    const loadPromise = waitIframeLoad(iframe, 12000)
    await prepare(iframe)
    await loadPromise
    await new Promise((r) => setTimeout(r, 280))
    try {
      iframe.contentWindow && iframe.contentWindow.print()
      return true
    } catch {
      return false
    } finally {
      if (active && typeof active.focus === 'function') {
        try { active.focus() } catch { /* ignore */ }
      }
    }
  }

  async function printBlob (blob) {
    if (!blob) return false
    return printFrame((iframe) => {
      printObjectUrl = window.URL.createObjectURL(blob)
      iframe.src = printObjectUrl
    })
  }

  async function printHtml (html) {
    const raw = String(html || '').trim()
    if (!raw) return false
    return withPrintBusy(() => printFrame((iframe) => {
      iframe.srcdoc = raw
    }))
  }

  async function printWithAgentOrBrowser (blob, apiParams = {}) {
    if (!blob) return false
    const agent = await probePrintAgent()
    const templatePaper = await resolvePaperMeta(apiParams)
    const savedSettings = loadPrintSettings()
    const paper = templatePaper
      ? Object.assign({}, templatePaper, { printerNote: savedSettings.printerNote })
      : savedSettings
    if (agent && isSilentPrintEnabled()) {
      try {
        const ok = await printViaAgent(blob, paper, {
          printerName: apiParams.printerName,
          printerMatch: apiParams.printerMatch || paper.printerNote
        })
        if (ok) return true
      } catch { /* fall through to browser */ }
    }
    return printBlob(blob)
  }

  async function withPrintBusy (fn) {
    if (state.printBusy) return false
    state.printBusy = true
    try {
      return await fn()
    } finally {
      state.printBusy = false
    }
  }

  async function printFullCached (apiParams = {}) {
    const params = Object.assign({}, fullPrintParams || {}, apiParams || {})
    return withPrintBusy(() => printWithAgentOrBrowser(fullPrintBlob, params))
  }

  async function ensureFullAndPrint (apiParams) {
    return withPrintBusy(async () => {
      const blob = await fetchFullPrintBlob(apiParams)
      if (!blob) return false
      return await printWithAgentOrBrowser(blob, apiParams)
    })
  }

  async function downloadPdf (apiParams) {
    if (!apiParams || !apiParams.templateId || state.pdfLoading) return
    state.pdfLoading = true
    try {
      const pdfBlob = await fetchPdfBlob(apiParams, false)
      if (!pdfBlob) return
      downloadBlob(pdfBlob, apiParams.templateId + '.pdf')
    } finally {
      state.pdfLoading = false
    }
  }

  async function downloadXlsx (apiParams) {
    if (!licenseIsPro(ctx.getLicenseStatus && ctx.getLicenseStatus())) return
    if (!apiParams || !apiParams.templateId || state.xlsxLoading) return
    state.xlsxLoading = true
    try {
      const params = Object.assign({}, apiParams, { printMode: PRINT_MODE_PREVIEW })
      const blob = await http.post(REPORT_XLSX, params, { responseType: 'blob', timeout: 120000 })
      downloadBlob(
        new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        apiParams.templateId + '.xlsx'
      )
    } finally {
      state.xlsxLoading = false
    }
  }

  function reset () {
    fullLoadedKey = ''
    fullPrintBlob = null
    fullPrintParams = null
    resetPaperMeta()
    currentKey = ''
    state.errorMessage = ''
    revokePrintUrl()
    clearPreview()
  }

  return {
    state,
    loadPdfPreview,
    printFullCached,
    ensureFullAndPrint,
    downloadPdf,
    downloadXlsx,
    fetchPdfBlob,
    fetchHtmlPreview,
    printHtml,
    reset,
    currentKey: () => currentKey
  }
}
