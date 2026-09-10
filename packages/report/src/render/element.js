import { layoutReport } from './placed.js'
import { paintReport } from './html.js'
import { reportToPdf } from './pdf.js'

const TAG = 'niqer-report'
const ATTRS = ['src', 'data-src', 'page', 'scale']

function fire (el, name, detail) {
  el.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }))
}

function numOf (raw, def) {
  if (raw == null || raw === '') return def
  const n = Number(raw)
  return Number.isFinite(n) ? n : def
}

function rootOf (el) {
  return el.shadowRoot || el
}

async function fetchJson (url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('report fetch ' + res.status + ' ' + url)
  return res.json()
}

class NiqerReport extends (typeof HTMLElement === 'function' ? HTMLElement : class {}) {
  static get observedAttributes () {
    return ATTRS.slice()
  }

  constructor () {
    super()
    if (this.attachShadow && !this.shadowRoot) this.attachShadow({ mode: 'open' })
    this._template = null
    this._dataset = null
    this._laid = null
    this._gen = 0
  }

  get src () { return this.getAttribute('src') }
  set src (v) { v == null || v === '' ? this.removeAttribute('src') : this.setAttribute('src', String(v)) }

  get dataSrc () { return this.getAttribute('data-src') }
  set dataSrc (v) { v == null || v === '' ? this.removeAttribute('data-src') : this.setAttribute('data-src', String(v)) }

  get page () { return numOf(this.getAttribute('page'), 0) }
  set page (v) { v == null || v === '' ? this.removeAttribute('page') : this.setAttribute('page', String(v)) }

  get scale () { return numOf(this.getAttribute('scale'), 1) }
  set scale (v) { Number(v) > 0 ? this.setAttribute('scale', String(v)) : this.removeAttribute('scale') }

  get template () { return this._template }
  set template (value) {
    this._template = value && typeof value === 'object' ? value : null
    this.reload()
  }

  get data () { return this._dataset }
  set data (value) {
    this._dataset = value
    this.reload()
  }

  get datasetJson () { return this._dataset }

  get laid () { return this._laid }

  get pageCount () {
    return this._laid ? this._laid.pages.length : 0
  }

  connectedCallback () {
    this.reload()
  }

  disconnectedCallback () {
    this._gen++
  }

  attributeChangedCallback (name) {
    if (!this.isConnected) return
    if (name === 'src' || name === 'data-src') {
      this.reload()
      return
    }
    if (this._laid) this.paint()
  }

  async reload () {
    const gen = ++this._gen
    try {
      let template = this._template
      const src = this.src
      if (!template && src) {
        template = await fetchJson(src)
        if (gen !== this._gen) return
        this._template = template
      }
      let dataset = this._dataset
      const dataSrc = this.dataSrc
      if (dataset == null && dataSrc) {
        dataset = await fetchJson(dataSrc)
        if (gen !== this._gen) return
        this._dataset = dataset
      }
      if (!template) {
        rootOf(this).replaceChildren()
        this._laid = null
        return
      }
      this._laid = layoutReport(template, {
        dataset: dataset != null ? dataset : undefined,
        document: this.ownerDocument
      })
      if (gen !== this._gen) return
      this.paint()
      fire(this, 'load', { pages: this.pageCount, laid: this._laid })
    } catch (err) {
      if (gen !== this._gen) return
      this._laid = null
      rootOf(this).replaceChildren()
      fire(this, 'error', err)
    }
  }

  paint () {
    if (!this._laid) return 0
    return paintReport(this, this._laid, { scale: this.scale, page: this.page })
  }

  text () {
    if (!this._laid) return ''
    const pages = this.page >= 1
      ? this._laid.pages.filter((_, i) => i === this.page - 1)
      : this._laid.pages
    const bits = []
    for (const pg of pages) {
      for (const el of pg.elements) {
        if (el.type === 'text' || el.type === 'data' || !el.type) {
          const t = el.parsedContent != null ? el.parsedContent : el.content
          if (t) bits.push(String(t))
        }
      }
    }
    return bits.join('\n')
  }

  toPdf () {
    if (!this._template && !this._laid) return null
    return reportToPdf(this._template || {}, {
      laid: this._laid,
      dataset: this._dataset != null ? this._dataset : undefined,
      page: this.page
    })
  }
}

function defineReportElement (tag = TAG) {
  if (typeof customElements === 'undefined') return tag
  if (!customElements.get(tag)) customElements.define(tag, NiqerReport)
  return tag
}

function toElement (template, opts = {}) {
  if (typeof document === 'undefined') throw new Error('toElement needs document')
  defineReportElement()
  const el = document.createElement(TAG)
  if (opts.scale > 0) el.scale = opts.scale
  if (opts.page > 0) el.page = opts.page
  if (opts.src) el.src = opts.src
  if (opts.dataSrc) el.dataSrc = opts.dataSrc
  if (opts.data != null) el.data = opts.data
  if (template) el.template = template
  return el
}

defineReportElement()

export {
  TAG as REPORT_TAG,
  NiqerReport,
  defineReportElement,
  toElement
}
