import { createBlankTemplate, mountDesigner } from './designer.js'

const TAG = 'niqer-designer'
const ATTRS = ['src']

function fire (el, name, detail) {
  el.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }))
}

class NiqerDesigner extends (typeof HTMLElement === 'function' ? HTMLElement : class {}) {
  static get observedAttributes () {
    return ATTRS.slice()
  }

  constructor () {
    super()
    if (this.attachShadow && !this.shadowRoot) this.attachShadow({ mode: 'open' })
    this._api = null
    this._pending = null
    this._gen = 0
  }

  get src () { return this.getAttribute('src') }
  set src (v) { v == null || v === '' ? this.removeAttribute('src') : this.setAttribute('src', String(v)) }

  get template () {
    return this._api ? this._api.getTemplate() : this._pending
  }

  set template (value) {
    this._pending = value
    if (this._api) this._api.setTemplate(value)
  }

  get data () {
    return this._api ? this._api.getData() : null
  }

  set data (value) {
    if (this._api) this._api.setData(value)
    else if (this._pending) this._pending.dataset = value
  }

  connectedCallback () {
    this.mount()
  }

  disconnectedCallback () {
    this._gen++
    if (this._api && this._api.destroy) this._api.destroy()
    this._api = null
  }

  attributeChangedCallback (name) {
    if (!this.isConnected) return
    if (name === 'src') this.mount()
  }

  async mount () {
    const gen = ++this._gen
    try {
      let tpl = this._pending
      const src = this.src
      if (!tpl && src) {
        const res = await fetch(src)
        if (!res.ok) throw new Error('designer fetch ' + res.status)
        tpl = await res.json()
        if (gen !== this._gen) return
        this._pending = tpl
      }
      if (this._api && this._api.destroy) this._api.destroy()
      this._api = mountDesigner(this, { template: tpl || createBlankTemplate() })
      fire(this, 'ready', { template: this._api.getTemplate() })
    } catch (err) {
      if (gen !== this._gen) return
      fire(this, 'error', err)
    }
  }

  undo () { if (this._api) this._api.undo() }
  redo () { if (this._api) this._api.redo() }
}

function defineDesignerElement (tag = TAG) {
  if (typeof customElements === 'undefined') return tag
  if (!customElements.get(tag)) customElements.define(tag, NiqerDesigner)
  return tag
}

function toDesignerElement (template, opts = {}) {
  if (typeof document === 'undefined') throw new Error('toDesignerElement needs document')
  defineDesignerElement()
  const el = document.createElement(TAG)
  if (opts.src) el.src = opts.src
  if (template) el.template = template
  return el
}

defineDesignerElement()

export {
  TAG as DESIGNER_TAG,
  NiqerDesigner,
  defineDesignerElement,
  toDesignerElement
}
