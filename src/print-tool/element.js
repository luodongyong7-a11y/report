import { createBlankTemplate } from '../designer/model.js'
import { createDefaultFetcher } from './http.js'
import { mountPrintTool } from './shell.js'
import './preview-element.js'

const TAG = 'niqer-print-tool'
const ATTRS = ['src', 'api-base', 'template-api', 'locale', 'preview-html-path', 'preview-pdf-path']

function fire (el, name, detail) {
  el.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }))
}

class NiqerPrintTool extends (typeof HTMLElement === 'function' ? HTMLElement : class {}) {
  static get observedAttributes () {
    return ATTRS.slice()
  }

  constructor () {
    super()
    if (this.attachShadow && !this.shadowRoot) this.attachShadow({ mode: 'open' })
    this._api = null
    this._pending = null
    this._fetcher = null
    this._getAuthHeaders = null
    this._isAdmin = () => true
    this._hostPrintCount = null
    this._gen = 0
  }

  get src () { return this.getAttribute('src') }
  set src (v) { v == null || v === '' ? this.removeAttribute('src') : this.setAttribute('src', String(v)) }

  get apiBase () { return this.getAttribute('api-base') || '/report' }
  set apiBase (v) { this.setAttribute('api-base', String(v || '/report')) }

  get templateApi () { return this.getAttribute('template-api') || '/report/mode' }
  set templateApi (v) { this.setAttribute('template-api', String(v || '/report/mode')) }

  get locale () { return this.getAttribute('locale') || 'zh-CN' }
  set locale (v) { this.setAttribute('locale', String(v || 'zh-CN')) }

  get previewHtmlPath () { return this.getAttribute('preview-html-path') || '/designer/preview-embedded' }
  set previewHtmlPath (v) { this.setAttribute('preview-html-path', String(v || '/designer/preview-embedded')) }

  get previewPdfPath () { return this.getAttribute('preview-pdf-path') || '/designer/preview' }
  set previewPdfPath (v) { this.setAttribute('preview-pdf-path', String(v || '/designer/preview')) }

  get hostPrintCount () { return this._hostPrintCount }
  set hostPrintCount (v) {
    this._hostPrintCount = v
    if (this.isConnected) this.mount()
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

  get isAdmin () { return this._isAdmin }
  set isAdmin (fn) { this._isAdmin = typeof fn === 'function' ? fn : () => !!fn }

  get template () { return this._api ? this._api.getTemplate() : this._pending }
  set template (value) {
    this._pending = value
    if (this._api) this._api.setTemplate(value)
  }

  get data () { return this._api ? this._api.getData() : null }
  set data (value) {
    if (this._api) this._api.setData(value)
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
    try {
      let tpl = this._pending
      if (!tpl && this.src) {
        const res = await fetch(this.src)
        if (!res.ok) throw new Error('print-tool fetch ' + res.status)
        tpl = await res.json()
        if (gen !== this._gen) return
        this._pending = tpl
      }
      if (this._api && this._api.destroy) this._api.destroy()
      this._api = mountPrintTool(this, {
        template: tpl || createBlankTemplate(),
        templateApi: this.templateApi,
        apiBase: this.apiBase,
        fetcher: this._fetcher || createDefaultFetcher(() => this._getAuthHeaders && this._getAuthHeaders()),
        getAuthHeaders: () => this._getAuthHeaders && this._getAuthHeaders(),
        isAdmin: this._isAdmin,
        hostPrintCount: this._hostPrintCount,
        locale: this.locale,
        previewHtmlPath: this.previewHtmlPath,
        previewPdfPath: this.previewPdfPath
      })
      fire(this, 'ready', { template: this._api.getTemplate() })
    } catch (err) {
      if (gen !== this._gen) return
      fire(this, 'error', err)
    }
  }

  undo () { if (this._api) this._api.undo() }
  redo () { if (this._api) this._api.redo() }
  save () { if (this._api) return this._api.save() }
  preview () { if (this._api) return this._api.preview() }
  loadTemplate (id) { if (this._api) return this._api.loadTemplate(id) }
}

function definePrintToolElement (tag = TAG) {
  if (typeof customElements === 'undefined') return tag
  if (!customElements.get(tag)) customElements.define(tag, NiqerPrintTool)
  return tag
}

function toPrintToolElement (opts = {}) {
  if (typeof document === 'undefined') throw new Error('toPrintToolElement needs document')
  definePrintToolElement()
  const el = document.createElement(TAG)
  if (opts.src) el.src = opts.src
  if (opts.template) el.template = opts.template
  if (opts.fetcher) el.fetcher = opts.fetcher
  if (opts.getAuthHeaders) el.getAuthHeaders = opts.getAuthHeaders
  if (opts.locale) el.locale = opts.locale
  if (opts.hostPrintCount) el.hostPrintCount = opts.hostPrintCount
  if (opts.isAdmin != null) el.isAdmin = opts.isAdmin
  if (opts.previewHtmlPath) el.previewHtmlPath = opts.previewHtmlPath
  if (opts.previewPdfPath) el.previewPdfPath = opts.previewPdfPath
  return el
}

definePrintToolElement()

export {
  TAG as PRINT_TOOL_TAG,
  NiqerPrintTool,
  definePrintToolElement,
  toPrintToolElement
}
