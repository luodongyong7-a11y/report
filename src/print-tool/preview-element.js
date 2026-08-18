import { createDefaultFetcher } from './http.js'
import { createHttp } from './http.js'
import { PRINT_TOOL_CSS } from './style.js'
import { mountPreviewPage } from './preview.js'
import { previewKeyFromLocation } from './preview-jump.js'

const TAG = 'niqer-report-preview'
const ATTRS = ['api-base', 'template-api', 'preview-key', 'kind', 'locale', 'hide-header']

function fire (el, name, detail) {
  el.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }))
}

function kindFromLocation () {
  try {
    const path = new URL(window.location.href).pathname
    if (path.includes('preview-embedded')) return 'html'
  } catch { /* ignore */ }
  return 'pdf'
}

class NiqerReportPreview extends (typeof HTMLElement === 'function' ? HTMLElement : class {}) {
  static get observedAttributes () {
    return ATTRS.slice()
  }

  constructor () {
    super()
    if (this.attachShadow && !this.shadowRoot) this.attachShadow({ mode: 'open' })
    this._api = null
    this._fetcher = null
    this._getAuthHeaders = null
    this._apiParams = null
    this._gen = 0
  }

  get apiBase () { return this.getAttribute('api-base') || '/report' }
  set apiBase (v) { this.setAttribute('api-base', String(v || '/report')) }

  get templateApi () { return this.getAttribute('template-api') || '/report/mode' }
  set templateApi (v) { this.setAttribute('template-api', String(v || '/report/mode')) }

  get previewKey () { return this.getAttribute('preview-key') || previewKeyFromLocation() }
  set previewKey (v) { v ? this.setAttribute('preview-key', String(v)) : this.removeAttribute('preview-key') }

  get kind () {
    const raw = String(this.getAttribute('kind') || '').trim().toLowerCase()
    if (raw === 'html' || raw === 'pdf') return raw
    return kindFromLocation()
  }

  set kind (v) {
    const raw = String(v || '').trim().toLowerCase()
    this.setAttribute('kind', raw === 'html' ? 'html' : 'pdf')
  }

  get locale () { return this.getAttribute('locale') || 'zh-CN' }
  set locale (v) { this.setAttribute('locale', String(v || 'zh-CN')) }

  get hideHeader () { return this.getAttribute('hide-header') === 'true' || this.getAttribute('hide-header') === '' }
  set hideHeader (v) {
    if (v) this.setAttribute('hide-header', 'true')
    else this.removeAttribute('hide-header')
  }

  get fetcher () { return this._fetcher }
  set fetcher (fn) {
    this._fetcher = fn
    if (this.isConnected) this.mount()
  }

  get getAuthHeaders () { return this._getAuthHeaders }
  set getAuthHeaders (fn) {
    this._getAuthHeaders = fn
    if (this.isConnected) this.mount()
  }

  get apiParams () { return this._apiParams }
  set apiParams (v) {
    this._apiParams = v && typeof v === 'object' ? v : null
    if (this.isConnected) this.mount()
  }

  connectedCallback () { this.mount() }

  disconnectedCallback () {
    this._gen++
    if (this._api && this._api.destroy) this._api.destroy()
    this._api = null
  }

  attributeChangedCallback () {
    if (this.isConnected) this.mount()
  }

  async mount () {
    if (!this._fetcher && typeof this._getAuthHeaders !== 'function') return
    const gen = ++this._gen
    if (this._api && this._api.destroy) this._api.destroy()
    const doc = this.ownerDocument
    const root = this.shadowRoot || this
    const style = doc.createElement('style')
    style.textContent = PRINT_TOOL_CSS
    const box = doc.createElement('div')
    box.className = 'npt-preview-page tk-ui'
    root.replaceChildren(style, box)
    const http = createHttp({
      fetcher: this._fetcher || createDefaultFetcher(() => this._getAuthHeaders && this._getAuthHeaders()),
      getAuthHeaders: () => this._getAuthHeaders && this._getAuthHeaders()
    })
    this._api = mountPreviewPage(this, box, {
      http,
      templateApi: this.templateApi,
      kind: this.kind,
      hideHeader: this.hideHeader,
      apiParams: this._apiParams
    })
    try {
      await this._api.start(this.previewKey, this._apiParams ? { apiParams: this._apiParams } : null)
      if (gen !== this._gen) return
      fire(this, 'ready', { previewKey: this.previewKey, kind: this.kind })
    } catch (err) {
      if (gen !== this._gen) return
      fire(this, 'error', err)
    }
  }

  print () { return this._api ? this._api.print() : Promise.resolve(false) }
  downloadPdf () { return this._api ? this._api.downloadPdf() : Promise.resolve() }
  downloadXlsx () { return this._api ? this._api.downloadXlsx() : Promise.resolve() }
}

function defineReportPreviewElement (tag = TAG) {
  if (typeof customElements === 'undefined') return tag
  if (!customElements.get(tag)) customElements.define(tag, NiqerReportPreview)
  return tag
}

function toReportPreviewElement (opts = {}) {
  if (typeof document === 'undefined') throw new Error('toReportPreviewElement needs document')
  defineReportPreviewElement()
  const el = document.createElement(TAG)
  if (opts.apiBase) el.apiBase = opts.apiBase
  if (opts.templateApi) el.templateApi = opts.templateApi
  if (opts.previewKey) el.previewKey = opts.previewKey
  if (opts.kind) el.kind = opts.kind
  if (opts.locale) el.locale = opts.locale
  if (opts.hideHeader) el.hideHeader = opts.hideHeader
  if (opts.fetcher) el.fetcher = opts.fetcher
  if (opts.getAuthHeaders) el.getAuthHeaders = opts.getAuthHeaders
  if (opts.apiParams) el.apiParams = opts.apiParams
  return el
}

defineReportPreviewElement()

export {
  TAG as REPORT_PREVIEW_TAG,
  NiqerReportPreview,
  defineReportPreviewElement,
  toReportPreviewElement
}
