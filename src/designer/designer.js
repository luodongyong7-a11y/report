// 禁止: canvas-barcode.js 的 pad/DPR/Adobe；条码尺寸只认 -6
import { encode, defineBarcodeElement } from '@niqer/barcode'
import { getFirstPlaceholderToken, getIterationArrayPath, ROW_COND_BG_OPS } from '../expressions.js'
import { toast } from '../print-tool/util.js'
defineBarcodeElement()
import { REPORT_TEXT_PADDING_PX, fontSizeToPx, resolveMediaPaddingPx, resolveReportFontFamily } from '../fontPolicy.js'
import { REPORT_SAFE_MARGIN_PX } from '../paper.js'
import { barcodeElementGeometry } from '../print-tool/preview-barcode-size.js'
import {
  alignX,
  alignY,
  applyBarcodeFormat,
  applyBorderDraft,
  applyTextStyle,
  centerH,
  centerV,
  borderSidesOf,
  setBorderOff,
  setBorderOn,
  spaceAround,
  syncColumnWidths,
  toggleBorderSide,
  toggleMainBorder
} from './align.js'
import { buildMergedElementFromSorted, validateMergeSelectionV2 } from './merge.js'
import { readBorderDraft, renderToolbar } from '../print-tool/toolbar.js'
import { createHistory } from './history.js'
import {
  applyCustomPaperMm,
  applyPaperPreset,
  applyPrintKind,
  cloneJson,
  createBlankTemplate,
  createElement,
  datasetFields,
  exportTemplate,
  normalizeDesignerTemplate,
  pxToMm,
  refreshGroups,
  snap,
  snapQrcode
} from './model.js'
import { DESIGNER_CSS } from './style.js'
import { ht } from '../print-tool/i18n.js'
import { isBwipMatrixBcid, listBwipSymbolGroups } from '../barcodeBwipCatalog.js'

const CROSS_TAB_CLIPBOARD_KEY = 'designer-cross-tab-clipboard'

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_DIR = {
  n: 'top',
  s: 'bottom',
  e: 'right',
  w: 'left',
  nw: 'top-left',
  ne: 'top-right',
  se: 'bottom-right',
  sw: 'bottom-left'
}
const GUIDE_SEL = '.header-line, .footer-line, .summary-a-line, .summary-b-line'
const EL_SEL = '.draggable-element'
const HANDLE_SEL = '.resize-handle-top, .resize-handle-bottom, .resize-handle-left, .resize-handle-right, .resize-handle-top-left, .resize-handle-top-right, .resize-handle-bottom-right, .resize-handle-bottom-left'

function fire (host, name, detail) {
  host.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }))
}

function elById (tpl, id) {
  return (tpl.elements || []).find((e) => e.id === id)
}

function paperPoint (paper, ev, scale) {
  const r = paper.getBoundingClientRect()
  return {
    x: snap((ev.clientX - r.left) / scale),
    y: snap((ev.clientY - r.top) / scale)
  }
}

function intersects (a, b) {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
}

function applyBox (node, el, selected) {
  node.style.left = el.x + 'px'
  node.style.top = el.y + 'px'
  node.style.width = el.width + 'px'
  node.style.height = el.height + 'px'
  if (selected) {
    node.style.outline = '1pt dashed #007bff'
    node.style.outlineOffset = '-1px'
    node.style.zIndex = '9999'
  } else {
    node.style.outline = ''
    node.style.outlineOffset = ''
    node.style.zIndex = ''
  }
}

function textStyle (el) {
  const s = el.style || {}
  const fs = fontSizeToPx(s.fontSize)
  return {
    fontSize: fs + 'px',
    fontFamily: resolveReportFontFamily(s.fontFamily, s.fontWeight, s.fontStyle),
    fontWeight: s.fontWeight || 'normal',
    fontStyle: s.fontStyle || 'normal',
    color: s.color || '#000',
    textAlign: el.textAlign || 'center',
    justifyContent: el.textAlign === 'left' ? 'flex-start' : (el.textAlign === 'right' ? 'flex-end' : 'center'),
    alignItems: el.verticalAlign === 'bottom' ? 'flex-end' : (el.verticalAlign === 'center' ? 'center' : 'flex-start'),
    padding: REPORT_TEXT_PADDING_PX + 'px',
    textDecoration: s.textDecoration || 'none'
  }
}

const SUBTOTAL_PLACEHOLDER_RE = /\$\{\s*subtotal\s*\([^}]*\)\s*\}/i

function headerHeightOf (tpl) {
  if (tpl && tpl.headerHeight != null) return Number(tpl.headerHeight)
  return Number(tpl && tpl.headerY) || 0
}

function footerHeightOf (tpl) {
  const h = (tpl && tpl.paperSize && tpl.paperSize.height) || 0
  if (tpl && tpl.footerHeight != null) return Number(tpl.footerHeight)
  if (Number.isFinite(Number(tpl && tpl.footerY))) return h - Number(tpl.footerY)
  return 60
}

function footerYOf (tpl) {
  const h = (tpl && tpl.paperSize && tpl.paperSize.height) || 0
  return h - footerHeightOf(tpl)
}

function defaultSummaryBTop (tpl) {
  const h = (tpl && tpl.paperSize && tpl.paperSize.height) || 0
  return Math.max(headerHeightOf(tpl) + 2, footerYOf(tpl) - 100)
}

function isSubtotalMisplaced (element, tpl) {
  if (!element || !element.content) return false
  if (!SUBTOTAL_PLACEHOLDER_RE.test(element.content)) return false
  const y = element.y || 0
  const regionTop = Number.isFinite(Number(tpl && tpl.summaryB)) ? Number(tpl.summaryB) : defaultSummaryBTop(tpl)
  const regionBottom = ((tpl && tpl.paperSize && tpl.paperSize.height) || 0) - footerHeightOf(tpl)
  return y >= regionTop && y < regionBottom
}

function canConvertType (oldType, newType) {
  if ((oldType === 'text' || oldType === 'data') && (newType === 'text' || newType === 'data')) return true
  if ((oldType === 'qrcode' || oldType === 'barcode') && (newType === 'qrcode' || newType === 'barcode')) return true
  return oldType === newType
}

function fieldExpr (name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) return ''
  return trimmed.indexOf('.') >= 0 ? '${' + trimmed + '}' : '${param.' + trimmed + '}'
}

function syncTextDataType (el) {
  if (!el || (el.type !== 'text' && el.type !== 'data')) return
  el.type = hasVariable(el.content) ? 'data' : 'text'
}

function hasVariable (content) {
  if (!content) return false
  return /\$\{[^}]+\}/.test(content)
}

function displayedSummary (tpl, key) {
  const paperH = Number(tpl && tpl.paperSize && tpl.paperSize.height) || 0
  const headerH = headerHeightOf(tpl)
  const footerH = footerHeightOf(tpl)
  const minTop = headerH + 2
  const maxTop = Math.max(minTop, paperH - footerH)
  const footerStart = paperH - footerH
  const fallback = key === 'summaryA' ? footerStart - 150 : footerStart - 100
  const raw = tpl && tpl[key]
  const val = typeof raw === 'number' ? raw : fallback
  return Math.max(minTop, Math.min(val, maxTop))
}

function paintBarcodeInto (node, el) {
  node.replaceChildren()
  const text = String(el.content || '')
  if (!text || hasVariable(text)) {
    const ph = node.ownerDocument.createElement('div')
    ph.className = 'placeholder ' + (el.type === 'qrcode' ? 'qrcode-placeholder' : 'barcode-placeholder')
    ph.textContent = !text ? (el.type === 'qrcode' ? '二维码' : '条形码') : text
    node.appendChild(ph)
    return
  }
  try {
    const format = el.type === 'qrcode'
      ? (el.qrcodeFormat || 'qrcode')
      : (el.barcodeFormat || 'code128')
    const symbol = encode(text, { format })
    const geo = barcodeElementGeometry(el, symbol)
    const tag = node.ownerDocument.createElement('niqer-barcode')
    tag.className = el.type === 'qrcode' ? 'qrcode-canvas' : 'barcode-canvas'
    tag.setAttribute('text', text)
    tag.setAttribute('format', geo.format)
    tag.setAttribute('module', String(geo.module))
    tag.setAttribute('height', String(geo.height))
    tag.setAttribute('color', geo.color)
    node.appendChild(tag)
  } catch {
    const ph = node.ownerDocument.createElement('div')
    ph.className = 'placeholder'
    ph.textContent = text
    node.appendChild(ph)
  }
}

export function mountDesigner (host, opts = {}) {
  const doc = host.ownerDocument
  const root = opts.root || host.shadowRoot || host
  const hist = createHistory(50)
  const state = {
    tpl: normalizeDesignerTemplate(opts.template),
    selected: new Set(),
    scale: Number(opts.scale) > 0 ? Number(opts.scale) : 1,
    leftTab: 'comp',
    drag: null,
    clipboard: [],
    lastMouse: { x: 0, y: 0 },
    editingId: '',
    editBox: null,
    borderDraft: { width: 1, style: 'solid', color: '#000000' },
    tbMenu: '',
    holdBorderColor: false
  }
  hist.reset(state.tpl)

  let wrap
  let bar
  let leftPane
  let rightPane
  let paper
  let canvasWrap
  let paperBox
  if (opts.shell) {
    wrap = opts.shell.wrap
    bar = opts.shell.bar
    leftPane = opts.shell.leftPane
    rightPane = opts.shell.rightPane
    paper = opts.shell.paper
    canvasWrap = opts.shell.canvasWrap
    paperBox = opts.shell.paperBox || (paper && paper.parentElement)
    if (opts.shell.style && !opts.shell.style.textContent) opts.shell.style.textContent = DESIGNER_CSS
  } else {
    const style = doc.createElement('style')
    style.textContent = DESIGNER_CSS
    wrap = doc.createElement('div')
    wrap.className = 'nd'
    wrap.tabIndex = 0
    wrap.innerHTML = `
    <div class="nd-bar"></div>
    <div class="nd-body">
      <div class="nd-side left">
        <div class="nd-tabs">
          <button type="button" data-tab="comp" class="on">组件</button>
          <button type="button" data-tab="prop">属性</button>
        </div>
        <div class="nd-pane" data-pane="left"></div>
      </div>
      <div class="nd-canvas-wrap"><div class="nd-paper"></div></div>
      <div class="nd-side right">
        <div class="nd-tabs"><button type="button" class="on">数据集</button></div>
        <div class="nd-pane" data-pane="right"></div>
      </div>
    </div>`
    root.replaceChildren(style, wrap)
    bar = wrap.querySelector('.nd-bar')
    leftPane = wrap.querySelector('[data-pane=left]')
    rightPane = wrap.querySelector('[data-pane=right]')
    paper = wrap.querySelector('.nd-paper, .paper')
    canvasWrap = wrap.querySelector('.nd-canvas-wrap, .design-area')
    paperBox = wrap.querySelector('.paper-container') || (paper && paper.parentElement)
  }
  const skipRight = opts.skipRight || !rightPane
  const skipLeft = opts.skipLeft || !leftPane
  const extraToolbarHtml = opts.extraToolbarHtml || ''

  function emitChange () {
    refreshGroups(state.tpl)
    fire(host, 'change', { template: exportTemplate(state.tpl) })
  }

  function commit () {
    hist.push(state.tpl)
    emitChange()
    paintAll()
  }

  function setTpl (next, record) {
    state.tpl = normalizeDesignerTemplate(next)
    if (record !== false) hist.push(state.tpl)
    emitChange()
    paintAll()
  }

  function selectedEls () {
    return [...state.selected].map((id) => elById(state.tpl, id)).filter(Boolean)
  }

  function paintToolbar () {
    if (state.tbMenu === 'border' && !state.selected.size) state.tbMenu = ''
    const root = bar.getRootNode ? bar.getRootNode() : null
    const ae = root && root.activeElement && bar.contains(root.activeElement) ? root.activeElement : null
    const keep = (ae && (ae.dataset.act === 'mmw' || ae.dataset.act === 'mmh'))
      ? { act: ae.dataset.act, value: ae.value }
      : null
    bar.classList.add('toolbar')
    bar.innerHTML = renderToolbar(state.tpl, selectedEls(), {
      t: (key) => ht(host, key),
      borderDraft: state.borderDraft,
      tbMenu: state.tbMenu
    }) + extraToolbarHtml
    if (keep) {
      const el = bar.querySelector('[data-act="' + keep.act + '"]')
      if (el) {
        el.value = keep.value
        el.focus()
      }
    }
  }

  function closeTbMenus () {
    state.tbMenu = ''
    state.holdBorderColor = false
    bar.querySelectorAll('.tb-drop.is-open').forEach((el) => el.classList.remove('is-open'))
  }

  function openTbMenu (name) {
    if (name === 'border' && !state.selected.size) return
    state.tbMenu = state.tbMenu === name ? '' : name
    bar.querySelectorAll('.tb-drop[data-drop]').forEach((el) => {
      el.classList.toggle('is-open', el.dataset.drop === state.tbMenu)
    })
  }

  function eventIn (el, ev) {
    if (!el) return false
    const path = ev.composedPath ? ev.composedPath() : [ev.target]
    return path.indexOf(el) >= 0
  }

  function applyBorderPen (commitNow, refreshBar) {
    state.borderDraft = readBorderDraft(bar)
    state.tbMenu = 'border'
    if (applyBorderDraft(state.tpl, state.selected, state.borderDraft)) {
      if (commitNow) {
        hist.push(state.tpl)
        emitChange()
      }
      paintPaper()
    }
    if (refreshBar) paintToolbar()
  }

  function paintPalette () {
    const icon = {
      text: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
      image: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
      qrcode: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>',
      barcode: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/></svg>'
    }
    const items = [
      ['text', 'designer.main.compText'],
      ['image', 'designer.main.compImage'],
      ['qrcode', 'designer.main.compQrcode'],
      ['barcode', 'designer.main.compBarcode']
    ]
    let html = '<div class="components-list">'
    for (const [type, key] of items) {
      html += '<div class="component-item" draggable="true" data-type="' + type + '"><div class="component-icon">' + icon[type] + '</div><span>' + ht(host, key) + '</span></div>'
    }
    html += '</div>'
    leftPane.innerHTML = html
  }

  function collectMergeableTokens (content) {
    if (typeof content !== 'string') return []
    const re = /\$\{([^}]+)\}/g
    const out = []
    let m
    while ((m = re.exec(content))) {
      const token = m[1].trim()
      if (/^row\s*\(/i.test(token) || /^subtotal\s*\(/i.test(token) || /^sum\s*\(/i.test(token) || /^count\s*\(/i.test(token) || /^now\s*\(/i.test(token)) continue
      if (token === 'page' || token === 'total') continue
      out.push(token)
    }
    return out
  }

  function dsPrefixFromElement (el) {
    const content = el && el.content
    if (typeof content !== 'string') return 'ds1'
    const firstToken = getFirstPlaceholderToken(content)
    if (!firstToken) return 'ds1'
    const pathForArray = getIterationArrayPath(firstToken)
    if (!pathForArray) return 'ds1'
    const firstSeg = String(pathForArray).split('.').filter(Boolean)[0] || ''
    if (/^ds\d+$/i.test(firstSeg)) return firstSeg.toLowerCase()
    return 'ds1'
  }

  function toDsField (prefix, token) {
    const t = String(token || '').trim()
    if (!t) return ''
    if (/^ds\d+\./i.test(t)) return t
    const ds = prefix && /^ds\d+$/i.test(prefix) ? prefix : 'ds1'
    return ds + '.' + t
  }

  function fieldCandidates () {
    const set = new Set()
    for (const item of state.tpl.elements || []) {
      if (!item || (item.type !== 'text' && item.type !== 'data') || !item.content) continue
      const prefix = dsPrefixFromElement(item)
      for (const token of collectMergeableTokens(item.content)) {
        const path = toDsField(prefix, token)
        if (path) set.add(path)
      }
    }
    const ds = state.tpl.dataset || {}
    for (const [vn, spec] of Object.entries(ds)) {
      if (!/^ds\d+$/i.test(vn)) continue
      const fields = spec && Array.isArray(spec.fields) ? spec.fields : []
      for (const f of fields) {
        if (typeof f === 'string' && f.trim()) set.add(String(vn).toLowerCase() + '.' + f.trim())
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }

  function escAttr (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  }

  function switchHtml (key, on, title) {
    return '<button type="button" class="npt-switch" data-p="' + key + '" data-on="' + (on ? '1' : '0') + '" title="' + escAttr(title) + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"><span class="npt-switch__core"></span></button>'
  }

  function barcodeStyleSelectHtml (el) {
    const matrix = el.type === 'qrcode'
    const p = matrix ? 'qrcodeFormat' : 'barcodeFormat'
    const cur = String((matrix ? el.qrcodeFormat : el.barcodeFormat) || (matrix ? 'qrcode' : 'code128')).toLowerCase()
    const titleKey = matrix ? 'designer.properties.qrcodeStyle' : 'designer.properties.barcodeStyle'
    let html = '<div class="property-item"><select data-p="' + p + '" title="' + escAttr(ht(host, titleKey)) + '">'
    let seen = false
    for (const g of listBwipSymbolGroups({ mainstream: true })) {
      const items = g.items.filter((s) => isBwipMatrixBcid(s.bcid) === matrix)
      if (!items.length) continue
      html += '<optgroup label="' + escAttr(ht(host, g.labelKey) || g.id) + '">'
      for (const s of items) {
        if (s.bcid === cur) seen = true
        const lab = ht(host, s.descKey) || s.desc || s.bcid
        html += '<option value="' + escAttr(s.bcid) + '"' + (s.bcid === cur ? ' selected' : '') + '>' + escAttr(lab) + '</option>'
      }
      html += '</optgroup>'
    }
    if (!seen && cur) html += '<option value="' + escAttr(cur) + '" selected>' + escAttr(cur) + '</option>'
    html += '</select></div>'
    return html
  }

  function formatPrevNodeIds (prev) {
    if (prev == null || prev === '' || (Array.isArray(prev) && !prev.length)) return ht(host, 'designer.properties.noDependency')
    const s = Array.isArray(prev) ? prev.join(',') : String(prev)
    if (!s.trim()) return ht(host, 'designer.properties.noDependency')
    return s.split(',').join('\n')
  }

  function canBatchModifyX () {
    const els = selectedEls()
    if (els.length <= 1) return true
    return els.every((e) => e.x === els[0].x)
  }

  function canBatchModifyY () {
    const els = selectedEls()
    if (els.length <= 1) return true
    return els.every((e) => e.y === els[0].y)
  }

  function fieldInput (key, value, placeholder, extraClass, title) {
    return '<input data-p="' + key + '" list="npt-fc" class="' + (extraClass || '') + '" value="' + escAttr(value) + '" placeholder="' + escAttr(placeholder) + '"' + (title ? ' title="' + escAttr(title) + '"' : '') + '>'
  }

  function fieldDatalist () {
    return '<datalist id="npt-fc">' + fieldCandidates().map((f) => '<option value="' + escAttr(f) + '">').join('') + '</datalist>'
  }

  function countPlaceholders (content) {
    if (typeof content !== 'string') return 0
    const m = content.match(/\$\{[^}]+\}/g)
    return m ? m.length : 0
  }

  function paintProps () {
    const id = [...state.selected][0]
    const el = id ? elById(state.tpl, id) : null
    if (!el) {
      leftPane.innerHTML = '<div class="properties-panel"><div class="no-selection"><p>' + ht(host, 'designer.properties.selectElementHint') + '</p></div></div>'
      return
    }
    const multi = state.selected.size > 1
    const textish = el.type === 'text' || el.type === 'data'
    const showFormat = textish && !multi && countPlaceholders(el.content) === 1
    const isCurrency = showFormat && el.formatType === 'number' && el.numberFormat === 'currency'
    const batchX = canBatchModifyX()
    const batchY = canBatchModifyY()
    const rowCondTitle = ht(host, 'designer.properties.rowCondBgSection') + ' — ' + ht(host, 'designer.properties.rowCondBgHint')
    const rowCondValueTitle = rowCondTitle + ' ' + ht(host, 'designer.properties.rowCondBgValueHint')
    const colorTrim = typeof el.rowCondBgColor === 'string' ? el.rowCondBgColor.trim() : ''
    const pathTrim = typeof el.rowCondBgPath === 'string' ? el.rowCondBgPath.trim() : ''
    const showRowCondExtra = Boolean(colorTrim || pathTrim)
    const colorVal = colorTrim || '#ffe4e4'
    const dateFmt = el.dateFormat || 'yyyy-MM-dd'
    const dateOpts = [
      ['yyyy-MM-dd', 'yyyy-MM-dd'],
      ['yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm:ss'],
      ['yyyy/MM/dd', 'yyyy/MM/dd'],
      ['yyyy年MM月dd日', ht(host, 'designer.properties.dateFormatCn')],
      ['MM/dd/yyyy', 'MM/dd/yyyy'],
      ['dd/MM/yyyy', 'dd/MM/yyyy']
    ]
    const dp = el.decimalPlaces
    const dpShow = (dp == null || dp === '' || dp === 'auto') ? '' : String(dp)
    let html = '<div class="properties-panel"><div class="property-group">'
    if (multi) html += '<div class="selection-info"><p>' + ht(host, 'designer.properties.selectedCount', { count: state.selected.size }) + '</p></div>'
    html += '<div class="property-item"><select data-p="type">'
    html += '<option value="text"' + (el.type === 'text' ? ' selected' : '') + '>' + ht(host, 'designer.main.compText') + '</option>'
    html += '<option value="data"' + (el.type === 'data' ? ' selected' : '') + '>' + ht(host, 'designer.properties.compData') + '</option>'
    html += '<option value="image"' + (el.type === 'image' ? ' selected' : '') + '>' + ht(host, 'designer.main.compImage') + '</option>'
    html += '<option value="qrcode"' + (el.type === 'qrcode' ? ' selected' : '') + '>' + ht(host, 'designer.main.compQrcode') + '</option>'
    html += '<option value="barcode"' + (el.type === 'barcode' ? ' selected' : '') + '>' + ht(host, 'designer.main.compBarcode') + '</option>'
    html += '</select></div>'
    if (el.type === 'barcode' || el.type === 'qrcode') html += barcodeStyleSelectHtml(el)
    if (showFormat) {
      html += '<div class="property-item property-block-top"><select data-p="formatType"><option value="none"' + (!el.formatType || el.formatType === 'none' ? ' selected' : '') + '>' + ht(host, 'designer.properties.formatNone') + '</option><option value="date"' + (el.formatType === 'date' ? ' selected' : '') + '>' + ht(host, 'designer.properties.formatDate') + '</option><option value="number"' + (el.formatType === 'number' ? ' selected' : '') + '>' + ht(host, 'designer.properties.formatNumber') + '</option></select></div>'
      if (el.formatType === 'date') {
        html += '<div class="property-item"><select data-p="dateFormat">'
        html += dateOpts.map(([v, lab]) => '<option value="' + v + '"' + (dateFmt === v ? ' selected' : '') + '>' + lab + '</option>').join('')
        html += '</select></div>'
      }
      if (el.formatType === 'number') {
        html += '<div class="property-item"><select data-p="numberFormat"><option value="default"' + ((el.numberFormat || 'default') === 'default' ? ' selected' : '') + '>' + ht(host, 'designer.properties.numberDefault') + '</option><option value="currency"' + (el.numberFormat === 'currency' ? ' selected' : '') + '>' + ht(host, 'designer.properties.numberCurrency') + '</option><option value="percent"' + (el.numberFormat === 'percent' ? ' selected' : '') + '>' + ht(host, 'designer.properties.numberPercent') + '</option></select></div>'
        if (isCurrency) {
          html += '<div class="property-item property-currency-item"><span class="inline-label">' + ht(host, 'designer.properties.currencySymbol') + '</span><input type="text" class="currency-symbol-input" data-p="currencySymbol" maxlength="8" value="' + escAttr(el.currencySymbol != null ? el.currencySymbol : '¥') + '" title="' + escAttr(ht(host, 'designer.properties.currencySymbol')) + '"></div>'
          html += '<div class="property-item property-currency-item"><span class="inline-label">' + ht(host, 'designer.properties.useGrouping') + '</span>' + switchHtml('useGrouping', el.useGrouping !== false, ht(host, 'designer.properties.useGrouping')) + '</div>'
        }
        html += '<div class="property-item"><select data-p="roundingMode" title="' + escAttr(ht(host, 'designer.properties.roundingMode')) + '"><option value="none"' + (el.roundingMode === 'none' ? ' selected' : '') + '>' + ht(host, 'designer.properties.roundingNone') + '</option><option value="half_up"' + ((el.roundingMode || 'half_up') === 'half_up' ? ' selected' : '') + '>' + ht(host, 'designer.properties.roundingHalfUp') + '</option><option value="down"' + (el.roundingMode === 'down' ? ' selected' : '') + '>' + ht(host, 'designer.properties.roundingDown') + '</option><option value="up"' + (el.roundingMode === 'up' ? ' selected' : '') + '>' + ht(host, 'designer.properties.roundingUp') + '</option></select></div>'
        html += '<div class="property-item"><input type="number" data-p="decimalPlaces" min="0" max="10" step="1" value="' + escAttr(dpShow) + '" title="' + escAttr(ht(host, 'designer.properties.decimalPlaces')) + '" placeholder="' + escAttr(ht(host, 'designer.properties.decimalPlacesAuto')) + '"></div>'
      }
    }
    if (textish) {
      html += '<div class="property-item property-block-top"><select data-p="mergeMode"><option value="none"' + (!el.mergeMode || el.mergeMode === 'none' ? ' selected' : '') + '>' + ht(host, 'designer.properties.mergeModeNone') + '</option><option value="first"' + (el.mergeMode === 'first' ? ' selected' : '') + '>' + ht(host, 'designer.properties.mergeModeFirst') + '</option><option value="sum"' + (el.mergeMode === 'sum' ? ' selected' : '') + '>' + ht(host, 'designer.properties.mergeModeSum') + '</option><option value="min"' + (el.mergeMode === 'min' ? ' selected' : '') + '>' + ht(host, 'designer.properties.mergeModeMin') + '</option></select></div>'
      if (el.mergeMode && el.mergeMode !== 'none') {
        html += '<div class="property-item property-merge-select">' + fieldInput('mergeGroupBy', el.mergeGroupBy, ht(host, 'designer.properties.mergeGroupByPlaceholder')) + '</div>'
        if (el.mergeMode === 'sum' || el.mergeMode === 'min') {
          html += '<div class="property-item property-merge-select">' + fieldInput('mergeSumField', el.mergeSumField, ht(host, el.mergeMode === 'min' ? 'designer.properties.mergeMinFieldPlaceholder' : 'designer.properties.mergeSumFieldPlaceholder')) + '</div>'
        }
        html += '<div class="property-item"><select data-p="mergeVerticalAlign"><option value="none"' + ((el.mergeVerticalAlign || 'none') === 'none' ? ' selected' : '') + '>' + ht(host, 'designer.properties.mergeVAlignNone') + '</option><option value="top"' + (el.mergeVerticalAlign === 'top' ? ' selected' : '') + '>' + ht(host, 'designer.properties.mergeVAlignTop') + '</option><option value="center"' + (el.mergeVerticalAlign === 'center' ? ' selected' : '') + '>' + ht(host, 'designer.properties.mergeVAlignCenter') + '</option><option value="bottom"' + (el.mergeVerticalAlign === 'bottom' ? ' selected' : '') + '>' + ht(host, 'designer.properties.mergeVAlignBottom') + '</option></select></div>'
      }
      html += '<div class="property-item property-row-cond-bg property-block-top" title="' + escAttr(rowCondTitle) + '"><div class="row-cond-compact-row"><input type="color" class="row-cond-color-input" data-p="rowCondBgColor" value="' + escAttr(colorVal) + '"><button type="button" class="clear-button row-cond-clear-inline" data-p="rowCondBgClear">' + ht(host, 'designer.properties.rowCondBgClear') + '</button></div>'
      if (showRowCondExtra) {
        const op = el.rowCondBgOp && ROW_COND_BG_OPS.includes(String(el.rowCondBgOp)) ? String(el.rowCondBgOp) : 'eq'
        const valueOff = op === 'empty' || op === 'not_empty'
        html += fieldInput('rowCondBgPath', el.rowCondBgPath, ht(host, 'designer.properties.rowCondBgPathPlaceholder'), 'row-cond-el-select', rowCondTitle)
        html += '<select class="row-cond-op-select" data-p="rowCondBgOp" title="' + escAttr(rowCondTitle) + '">' + ROW_COND_BG_OPS.map((o) => '<option value="' + o + '"' + (op === o ? ' selected' : '') + '>' + ht(host, 'designer.properties.rowCondBgOp_' + o) + '</option>').join('') + '</select>'
        html += '<input type="text" class="row-cond-value-input" data-p="rowCondBgValue" value="' + escAttr(el.rowCondBgValue == null ? '' : el.rowCondBgValue) + '" placeholder="' + escAttr(ht(host, 'designer.properties.rowCondBgValuePlaceholder')) + '" title="' + escAttr(rowCondValueTitle) + '"' + (valueOff ? ' disabled' : '') + '>'
      }
      html += '</div>'
    }
    html += '<div class="property-item property-block-top"><input type="number" data-p="x" value="' + el.x + '" title="' + escAttr(ht(host, 'designer.properties.hoverX')) + '"' + (batchX ? '' : ' disabled class="disabled-input"') + '></div>'
    html += '<div class="property-item"><input type="number" data-p="y" value="' + el.y + '" title="' + escAttr(ht(host, 'designer.properties.hoverY')) + '"' + (batchY ? '' : ' disabled class="disabled-input"') + '></div>'
    html += '<div class="property-item"><input type="number" data-p="width" value="' + el.width + '" title="' + escAttr(ht(host, 'designer.properties.hoverWidth')) + '"></div>'
    html += '<div class="property-item"><input type="number" data-p="height" value="' + el.height + '" title="' + escAttr(ht(host, 'designer.properties.hoverHeight')) + '"></div>'
    if (textish) {
      html += '<div class="property-item property-nullish-item property-block-top"><div class="nullish-row">' +
        switchHtml('tolerateNullish', el.tolerateNullish !== false, ht(host, 'designer.properties.hoverTolerateNullish')) +
        switchHtml('shrinkToFit', el.shrinkToFit === true, ht(host, 'designer.properties.hoverShrinkToFit')) +
        '</div></div>'
    }
    html += '<div class="property-item property-block-top"><input type="text" class="readonly-input" value="' + escAttr(el.id) + '" readonly disabled title="' + escAttr(ht(host, 'designer.properties.hoverElementId')) + '"></div>'
    html += '<div class="property-item"><input type="text" class="readonly-input" value="' + escAttr(el.groupId || ht(host, 'designer.properties.ungrouped')) + '" readonly disabled title="' + escAttr(ht(host, 'designer.properties.hoverGroupId')) + '"></div>'
    html += '<div class="property-item"><textarea readonly disabled class="readonly-textarea" title="' + escAttr(ht(host, 'designer.properties.hoverPrevNodeId')) + '">' + escAttr(formatPrevNodeIds(el.prevNodeId)) + '</textarea></div>'
    if (el.type === 'image') {
      html += '<div class="property-item property-image-upload-item property-block-top"><input type="file" accept="image/*" data-p="image" title="' + escAttr(ht(host, 'designer.properties.hoverUploadImage')) + '"><button type="button" class="clear-button" data-p="clearImage" title="' + escAttr(ht(host, 'designer.properties.hoverClearImage')) + '">' + ht(host, 'designer.properties.clearImage') + '</button></div>'
    }
    html += '</div>' + fieldDatalist() + '</div>'
    leftPane.innerHTML = html
  }

  function paintDataset () {
    if (skipRight) return
    const fields = datasetFields(state.tpl.dataset)
    const chips = fields.map((f) => '<button type="button" data-field="' + f + '">${' + f + '}</button>').join('')
    const json = JSON.stringify(state.tpl.dataset, null, 2)
    rightPane.innerHTML = `
      <p class="nd-hint">点字段插入到当前文本。下面是 dataset JSON。</p>
      <div class="nd-chips">${chips || '<span class="nd-hint">还没有字段，先在 JSON 里写 ds1.data</span>'}</div>
      <textarea data-ds style="width:100%;min-height:280px">${json.replace(/</g, '&lt;')}</textarea>
      <button type="button" data-act="applyds" style="margin-top:8px">应用数据集</button>
    `
  }

  const HANDLE_CLASS = {
    n: 'resize-handle-top',
    s: 'resize-handle-bottom',
    e: 'resize-handle-right',
    w: 'resize-handle-left',
    nw: 'resize-handle-top-left',
    ne: 'resize-handle-top-right',
    se: 'resize-handle-bottom-right',
    sw: 'resize-handle-bottom-left'
  }

  function elementPaintKey (el) {
    const s = el.style || {}
    const editing = state.editingId === el.id ? '1' : '0'
    let key = [
      el.type, el.content || '', el.placeholder || '', editing,
      el.verticalAlign || '', el.textAlign || '',
      s.fontSize || '', s.fontFamily || '', s.fontWeight || '', s.fontStyle || '',
      s.color || '', s.textDecoration || '', s.backgroundColor || s.fill || '',
      el.barcodeFormat || '', el.qrcodeFormat || ''
    ].join('\x1f')
    if (el.type === 'barcode' || el.type === 'qrcode' || el.type === 'image') {
      key += '\x1f' + el.width + 'x' + el.height
    }
    return key
  }

  function syncHandles (wrapEl, selected) {
    for (const hd of [...wrapEl.querySelectorAll(HANDLE_SEL)]) hd.remove()
    if (!selected) return
    for (const h of HANDLES) {
      const hd = doc.createElement('div')
      hd.className = HANDLE_CLASS[h] || ('resize-handle-' + h)
      hd.dataset.handle = HANDLE_DIR[h] || h
      wrapEl.appendChild(hd)
    }
  }

  function paintElementNode (node, el) {
    const selected = state.selected.has(el.id)
    node.className = 'draggable-element' + (selected ? ' selected' : '') + (isSubtotalMisplaced(el, state.tpl) ? ' region-violation' : '')
    if (isSubtotalMisplaced(el, state.tpl)) node.title = ht(host, 'designer.canvas.subtotalNotAllowedInSummaryB')
    else node.removeAttribute('title')
    node.dataset.id = el.id
    node.dataset.index = String(state.tpl.elements.indexOf(el))
    applyBox(node, el, selected)
    node.style.boxSizing = 'border-box'
    const st = el.style || {}
    if (el.type === 'rect') {
      node.style.backgroundColor = st.backgroundColor || st.fill || '#000000'
      node.style.overflow = 'hidden'
    } else if (el.type === 'barcode' || el.type === 'qrcode' || el.type === 'image') {
      node.style.backgroundColor = st.backgroundColor || 'transparent'
      node.style.overflow = 'visible'
    } else {
      node.style.backgroundColor = st.backgroundColor || 'white'
    }
    const sides = borderSidesOf(el.border)
    if (sides.top || sides.right || sides.bottom || sides.left) {
      const color = selected ? '#ffffff' : (el.border.color || '#000')
      const w = (el.border.width || 1) + 'px'
      const bs = el.border.style || 'solid'
      const line = (on) => on ? w + ' ' + bs + ' ' + color : '0'
      node.style.borderTop = line(sides.top)
      node.style.borderRight = line(sides.right)
      node.style.borderBottom = line(sides.bottom)
      node.style.borderLeft = line(sides.left)
    } else {
      node.style.border = '0'
      node.style.borderTop = ''
      node.style.borderRight = ''
      node.style.borderBottom = ''
      node.style.borderLeft = ''
    }
    const key = elementPaintKey(el)
    const existing = node.firstElementChild
    if (existing && existing.classList.contains('element-content-wrapper') && node.dataset.ck === key) {
      syncHandles(existing, selected)
      return
    }
    node.dataset.ck = key
    const wrapEl = doc.createElement('div')
    wrapEl.className = 'element-content-wrapper'
    const mediaPad = resolveMediaPaddingPx(el) + 'px'
    if (el.type === 'text' || el.type === 'data') {
      const box = doc.createElement('div')
      box.className = 'text-content' + (!el.content ? ' placeholder' : '') + (hasVariable(el.content) ? ' variable-placeholder' : '')
      box.style.width = '100%'
      box.style.height = '100%'
      box.style.boxSizing = 'border-box'
      box.style.padding = REPORT_TEXT_PADDING_PX + 'px'
      const clip = doc.createElement('div')
      clip.className = 'text-content-clip'
      clip.style.display = 'flex'
      clip.style.alignItems = el.verticalAlign === 'bottom' ? 'flex-end' : (el.verticalAlign === 'center' ? 'center' : 'flex-start')
      clip.style.justifyContent = el.textAlign === 'left' ? 'flex-start' : (el.textAlign === 'right' ? 'flex-end' : 'center')
      const tx = doc.createElement('div')
      tx.className = 'text-content-text'
      const ts = textStyle(el)
      delete ts.display
      delete ts.alignItems
      delete ts.justifyContent
      ts.padding = '0'
      ts.fontKerning = 'none'
      ts.WebkitFontSmoothing = 'antialiased'
      ts.whiteSpace = 'pre-wrap'
      ts.wordWrap = 'break-word'
      ts.overflowWrap = 'break-word'
      ts.wordBreak = 'break-word'
      Object.assign(tx.style, ts)
      tx.textContent = el.content || el.placeholder || ht(host, 'designer.canvas.placeholderText')
      clip.appendChild(tx)
      box.appendChild(clip)
      wrapEl.appendChild(box)
    } else if (el.type === 'rect') {
      wrapEl.style.background = st.backgroundColor || st.fill || '#000'
    } else if (el.type === 'image') {
      if (state.editingId === el.id) {
        const editor = doc.createElement('div')
        editor.className = 'image-editor'
        const file = doc.createElement('input')
        file.type = 'file'
        file.accept = 'image/*'
        file.style.width = '100%'
        file.style.padding = '3px'
        file.style.boxSizing = 'border-box'
        file.addEventListener('change', () => {
          const f = file.files && file.files[0]
          if (!f) return
          const reader = new FileReader()
          reader.onload = () => {
            el.content = String(reader.result || '')
            const ta = editor.querySelector('textarea')
            if (ta) ta.value = el.content
          }
          reader.readAsDataURL(f)
        })
        const ta = doc.createElement('textarea')
        ta.className = 'text-editor'
        ta.value = el.content || ''
        ta.style.marginTop = '5px'
        ta.style.width = '100%'
        ta.style.boxSizing = 'border-box'
        ta.addEventListener('blur', () => {
          el.content = ta.value
          state.editingId = ''
          commit()
        })
        editor.appendChild(file)
        editor.appendChild(ta)
        wrapEl.appendChild(editor)
      } else {
        const box = doc.createElement('div')
        box.className = 'image-content'
        box.style.padding = mediaPad
        if (el.content && hasVariable(el.content)) {
          const ph = doc.createElement('div')
          ph.className = 'variable-placeholder'
          ph.textContent = el.content
          box.appendChild(ph)
        } else if (el.content) {
          const inner = doc.createElement('div')
          inner.className = 'image-wrapper'
          const img = doc.createElement('img')
          img.className = 'image-preview'
          img.src = el.content
          img.alt = ht(host, 'designer.canvas.imageAlt')
          img.draggable = false
          inner.appendChild(img)
          box.appendChild(inner)
        } else {
          const ph = doc.createElement('div')
          ph.className = 'image-placeholder placeholder'
          ph.textContent = ht(host, 'designer.canvas.placeholderImage')
          box.appendChild(ph)
        }
        wrapEl.appendChild(box)
      }
    } else {
      const isQr = el.type === 'qrcode'
      const box = doc.createElement('div')
      box.className = isQr ? 'qrcode-content' : 'barcode-content'
      box.style.padding = mediaPad
      if (el.content && hasVariable(el.content)) {
        const ph = doc.createElement('div')
        ph.className = 'variable-placeholder'
        ph.textContent = el.content
        box.appendChild(ph)
      } else if (el.content) {
        const inner = doc.createElement('div')
        inner.className = isQr ? 'qrcode-wrapper' : 'barcode-wrapper'
        paintBarcodeInto(inner, el)
        box.appendChild(inner)
      } else {
        const ph = doc.createElement('div')
        ph.className = 'placeholder ' + (isQr ? 'qrcode-placeholder' : 'barcode-placeholder')
        ph.textContent = el.placeholder || ht(host, isQr ? 'designer.canvas.placeholderQrcode' : 'designer.canvas.placeholderBarcode')
        box.appendChild(ph)
      }
      wrapEl.appendChild(box)
    }
    if (selected) {
      for (const h of HANDLES) {
        const hd = doc.createElement('div')
        hd.className = HANDLE_CLASS[h] || ('resize-handle-' + h)
        hd.dataset.handle = HANDLE_DIR[h] || h
        wrapEl.appendChild(hd)
      }
    }
    node.replaceChildren(wrapEl)
  }

  function paintGuides () {
    paper.querySelectorAll('.header-line, .footer-line, .summary-a-line, .summary-b-line, .print-safe-area').forEach((n) => n.remove())
    if (state.tpl.printKind === 'label') return
    const safe = REPORT_SAFE_MARGIN_PX
    const area = doc.createElement('div')
    area.className = 'print-safe-area'
    area.style.top = safe + 'px'
    area.style.left = safe + 'px'
    area.style.right = safe + 'px'
    area.style.bottom = safe + 'px'
    paper.appendChild(area)
    const headerY = headerHeightOf(state.tpl)
    const footerY = footerYOf(state.tpl)
    const showSummary = state.tpl.summaryEnabled !== false
    const lines = [
      [headerY, ht(host, 'designer.canvas.lineHeader'), 'header-line', 'headerY'],
      showSummary ? [displayedSummary(state.tpl, 'summaryA'), ht(host, 'designer.canvas.lineSummaryA'), 'summary-a-line', 'summaryA'] : null,
      showSummary ? [displayedSummary(state.tpl, 'summaryB'), ht(host, 'designer.canvas.lineSummaryB'), 'summary-b-line', 'summaryB'] : null,
      [footerY, ht(host, 'designer.canvas.lineFooter'), 'footer-line', 'footerY']
    ].filter(Boolean)
    for (const [y, label, cls, key] of lines) {
      if (!Number.isFinite(y)) continue
      const g = doc.createElement('div')
      g.className = cls
      g.dataset.band = key
      g.style.top = y + 'px'
      const sp = doc.createElement('span')
      sp.className = 'line-label'
      sp.textContent = label
      g.appendChild(sp)
      paper.appendChild(g)
    }
  }

  function paintPaper () {
    const w = state.tpl.paperSize.width
    const h = state.tpl.paperSize.height
    paper.classList.add('paper')
    paper.style.width = w + 'px'
    paper.style.height = h + 'px'
    if (paperBox) {
      paperBox.style.padding = '10px'
      paperBox.style.transform = 'scale(' + state.scale + ')'
      paperBox.style.transformOrigin = 'top left'
    } else {
      paper.style.transform = state.scale === 1 ? '' : 'scale(' + state.scale + ')'
    }
    const bg = state.tpl.pageBackground
    let bgImg = paper.querySelector('.page-background')
    if (bg && bg.previewDataUrl) {
      if (!bgImg) {
        bgImg = doc.createElement('img')
        bgImg.className = 'page-background'
        bgImg.alt = ''
        bgImg.draggable = false
        paper.insertBefore(bgImg, paper.firstChild)
      }
      bgImg.src = bg.previewDataUrl
    } else if (bgImg) bgImg.remove()
    canvasWrap.style.minHeight = (h * state.scale + 48) + 'px'
    const keep = new Set()
    for (const el of state.tpl.elements) {
      keep.add(el.id)
      let node = paper.querySelector('[data-id="' + el.id + '"]')
      if (!node) {
        node = doc.createElement('div')
        paper.appendChild(node)
      }
      paintElementNode(node, el)
    }
    for (const node of [...paper.querySelectorAll(EL_SEL)]) {
      if (!keep.has(node.dataset.id)) node.remove()
    }
    paintGuides()
  }

  function paintLeft () {
    if (skipLeft) return
    if (state.leftTab === 'prop') paintProps()
    else paintPalette()
  }

  function paintAll () {
    paintToolbar()
    paintLeft()
    paintDataset()
    paintPaper()
    fire(host, 'select', { ids: [...state.selected] })
  }

  function selectOnly (id, add) {
    if (!add) state.selected.clear()
    if (id) {
      if (add && state.selected.has(id)) state.selected.delete(id)
      else state.selected.add(id)
    }
    paintToolbar()
    paintPaper()
    if (state.leftTab === 'prop') paintProps()
    fire(host, 'select', { ids: [...state.selected] })
  }

  function placeType (type, pt, extra) {
    const el = createElement(type, pt, extra)
    state.tpl.elements.push(el)
    state.selected = new Set([el.id])
    commit()
  }

  let pendingType = null
  let pendingExtra = null

  if (leftPane) {
    leftPane.addEventListener('dragstart', (ev) => {
      const item = ev.target.closest('[data-type]')
      if (!item || !ev.dataTransfer) return
      ev.dataTransfer.setData('text/plain', item.dataset.type)
      ev.dataTransfer.setData('component-type', item.dataset.type)
      ev.dataTransfer.setData('niqer-type', item.dataset.type)
      ev.dataTransfer.setData('niqer-format', item.dataset.format || '')
      ev.dataTransfer.effectAllowed = 'copy'
    })
    leftPane.addEventListener('click', (ev) => {
      const item = ev.target.closest('[data-type]')
      if (!item) return
      pendingType = item.dataset.type
      pendingExtra = {}
      if (item.dataset.format) {
        if (pendingType === 'qrcode') pendingExtra.qrcodeFormat = item.dataset.format
        else pendingExtra.barcodeFormat = item.dataset.format
      }
    })
  }

  function dropPoint (ev) {
    const r = paper.getBoundingClientRect()
    return {
      x: snap((ev.clientX - r.left) / state.scale - 67),
      y: snap((ev.clientY - r.top) / state.scale - 20)
    }
  }

  function placeFields (pt, raw) {
    const fields = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!fields.length) return
    state.selected.clear()
    const created = []
    fields.forEach((name, index) => {
      const el = createElement('data', { x: snap(pt.x + index * 110), y: snap(pt.y) }, {
        content: fieldExpr(name),
        verticalAlign: 'top'
      })
      state.tpl.elements.push(el)
      state.selected.add(el.id)
      created.push(el)
    })
    if (created.length > 1) alignY(state.tpl, state.selected)
    commit()
  }

  function closeEditBox (ok) {
    const box = wrap.querySelector('.tk-edit-box')
    if (state.editBox && ok) {
      const el = elById(state.tpl, state.editBox.id)
      if (el) {
        el.content = state.editBox.content
        syncTextDataType(el)
        state.editBox = null
        if (box) box.remove()
        commit()
        return
      }
    }
    state.editBox = null
    if (box) box.remove()
  }

  function insertFieldIntoEditBox (raw) {
    if (!state.editBox) return
    const fields = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!fields.length) return
    const insertText = fields.map((f) => fieldExpr(f)).join('')
    const box = wrap.querySelector('.tk-edit-box')
    const ta = box && box.querySelector('textarea')
    const current = state.editBox.content || ''
    let start = current.length
    let end = current.length
    if (ta && typeof ta.selectionStart === 'number') {
      start = ta.selectionStart
      end = ta.selectionEnd
    }
    state.editBox.content = current.slice(0, start) + insertText + current.slice(end)
    if (ta) {
      ta.value = state.editBox.content
      const caret = start + insertText.length
      ta.focus()
      try { ta.setSelectionRange(caret, caret) } catch { /* ignore */ }
    }
  }

  function openEditBox (el) {
    selectOnly(el.id, false)
    state.editBox = { id: el.id, content: el.content || '' }
    let box = wrap.querySelector('.tk-edit-box')
    if (!box) {
      box = doc.createElement('div')
      box.className = 'tk-edit-box'
      wrap.appendChild(box)
    }
    const boxWidth = 480
    const viewW = (doc.defaultView && doc.defaultView.innerWidth) || wrap.clientWidth || 800
    box.style.left = Math.max(16, Math.round((viewW - boxWidth) / 2) - 120) + 'px'
    box.style.top = '110px'
    box.innerHTML =
      '<div class="tk-edit-box__title">' + ht(host, 'designer.canvas.editContentTitle') + '</div>' +
      '<textarea class="tk-edit-box__ta" placeholder="' + ht(host, 'designer.canvas.editContentPlaceholder') + '"></textarea>' +
      '<div class="tk-edit-box__hint">' + ht(host, 'designer.canvas.editContentDragHint') + '</div>' +
      '<div class="tk-edit-box__btns">' +
      '<button type="button" data-edit="cancel">' + ht(host, 'designer.canvas.editContentCancel') + '</button>' +
      '<button type="button" class="primary" data-edit="ok">' + ht(host, 'designer.canvas.editContentConfirm') + '</button>' +
      '</div>'
    const ta = box.querySelector('textarea')
    ta.value = state.editBox.content
    ta.addEventListener('input', () => { state.editBox.content = ta.value })
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeEditBox(false)
      }
      e.stopPropagation()
    })
    ta.addEventListener('dragover', (e) => {
      const types = e.dataTransfer ? Array.from(e.dataTransfer.types || []) : []
      if (!types.includes('tk-dnd-field')) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
    })
    ta.addEventListener('drop', (e) => {
      const types = e.dataTransfer ? Array.from(e.dataTransfer.types || []) : []
      if (!types.includes('tk-dnd-field')) return
      e.preventDefault()
      e.stopPropagation()
      const raw = e.dataTransfer.getData('text/plain')
      if (raw) insertFieldIntoEditBox(raw)
    })
    box.querySelector('[data-edit=cancel]').addEventListener('click', () => closeEditBox(false))
    box.querySelector('[data-edit=ok]').addEventListener('click', () => closeEditBox(true))
    box.addEventListener('mousedown', (e) => e.stopPropagation())
    ta.focus()
  }

  function beginEdit (el) {
    if (!el) return
    if (el.type === 'text' || el.type === 'data' || el.type === 'barcode' || el.type === 'qrcode') {
      if (state.editBox && state.editBox.id === el.id) return
      openEditBox(el)
      return
    }
    if (el.type !== 'image') return
    if (state.editingId === el.id) {
      const ta = paper.querySelector('[data-id="' + el.id + '"] textarea')
      if (ta) ta.focus()
      return
    }
    selectOnly(el.id, false)
    state.editingId = el.id
    paintPaper()
    const ta = paper.querySelector('[data-id="' + el.id + '"] textarea')
    if (ta) ta.focus()
  }

  function onCanvasDrop (ev) {
    ev.preventDefault()
    const dt = ev.dataTransfer
    const types = dt ? Array.from(dt.types || []) : []
    const hasComponent = types.includes('component-type') || types.includes('niqer-type')
    const hasField = types.includes('tk-dnd-field')
    const hasTpl = types.includes('tk-dnd-template')
    if (!hasComponent && !hasField && !hasTpl && !pendingType) return
    if (hasTpl || (dt && String(dt.getData('text/plain') || '').indexOf('template:') === 0)) {
      const raw = dt.getData('text/plain') || ''
      fire(host, 'load-template', { id: raw.replace(/^template:/, '') })
      return
    }
    if (hasField && !hasComponent) {
      placeFields(dropPoint(ev), dt.getData('text/plain') || '')
      return
    }
    const type = (dt && (dt.getData('component-type') || dt.getData('niqer-type') || dt.getData('text/plain'))) || pendingType
    if (!type || type.indexOf('template:') === 0) return
    const format = dt ? dt.getData('niqer-format') : ''
    const extra = {}
    if (format) {
      if (type === 'qrcode') extra.qrcodeFormat = format
      else extra.barcodeFormat = format
    }
    placeType(type, dropPoint(ev), extra)
    pendingType = null
  }
  canvasWrap.addEventListener('dragover', (ev) => {
    ev.preventDefault()
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'
  })
  canvasWrap.addEventListener('drop', onCanvasDrop)

  paper.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return
    const tag = ev.target && ev.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    wrap.focus()
    const handle = ev.target.closest(HANDLE_SEL)
    const band = ev.target.closest(GUIDE_SEL)
    const node = ev.target.closest(EL_SEL)
    const pt = paperPoint(paper, ev, state.scale)
    state.lastMouse = { x: pt.x, y: pt.y }
    if (pendingType && !node && !handle && !band) {
      placeType(pendingType, pt, pendingExtra)
      pendingType = null
      return
    }
    if (handle && node) {
      const el = elById(state.tpl, node.dataset.id)
      if (!el) return
      const resizing = (ev.ctrlKey || ev.metaKey)
        ? selectedEls().map((e) => ({ id: e.id, x: e.x, y: e.y, w: e.width, h: e.height }))
        : [{ id: el.id, x: el.x, y: el.y, w: el.width, h: el.height }]
      state.drag = {
        kind: 'resize',
        id: el.id,
        handle: handle.dataset.handle || 'se',
        x: pt.x,
        y: pt.y,
        ctrl: !!(ev.ctrlKey || ev.metaKey),
        resizing
      }
      ev.preventDefault()
      return
    }
    if (band) {
      state.drag = { kind: 'band', key: band.dataset.band, y: pt.y }
      ev.preventDefault()
      return
    }
    if (node) {
      state.drag = {
        kind: 'pending-el',
        id: node.dataset.id,
        x: pt.x,
        y: pt.y,
        clientX: ev.clientX,
        clientY: ev.clientY,
        ctrl: !!(ev.ctrlKey || ev.metaKey)
      }
      ev.stopPropagation()
      return
    }
    if (!ev.ctrlKey && !ev.metaKey) {
      selectOnly(null, false)
      return
    }
    state.drag = { kind: 'marquee', x: pt.x, y: pt.y }
    let box = paper.querySelector('.selection-box')
    if (!box) {
      box = doc.createElement('div')
      box.className = 'selection-box'
      paper.appendChild(box)
    }
    box.style.left = pt.x + 'px'
    box.style.top = pt.y + 'px'
    box.style.width = '0'
    box.style.height = '0'
  })

  paper.addEventListener('dblclick', (ev) => {
    const node = ev.target.closest(EL_SEL)
    if (!node) return
    ev.preventDefault()
    ev.stopPropagation()
    beginEdit(elById(state.tpl, node.dataset.id))
  })

  function clamp (v, min, max) {
    return Math.max(min, Math.min(v, max))
  }

  function applyResizeRect (el, start, dx, dy, direction) {
    const paperW = state.tpl.paperSize.width
    const paperH = state.tpl.paperSize.height
    const safe = REPORT_SAFE_MARGIN_PX
    const minSize = 10
    const safeLeft = safe
    const safeTop = safe
    const safeRight = paperW - safe
    const safeBottom = paperH - safe
    let left = start.x
    let top = start.y
    let right = start.x + start.w
    let bottom = start.y + start.h
    if (direction === 'right' || direction === 'e' || direction.indexOf('right') >= 0) right = start.x + start.w + dx
    if (direction === 'bottom' || direction === 's' || direction.indexOf('bottom') >= 0) bottom = start.y + start.h + dy
    if (direction === 'left' || direction === 'w' || direction.indexOf('left') >= 0) left = start.x + dx
    if (direction === 'top' || direction === 'n' || direction.indexOf('top') >= 0) top = start.y + dy
    if (left > right) { const t = left; left = right; right = t }
    if (top > bottom) { const t = top; top = bottom; bottom = t }
    left = clamp(left, safeLeft, safeRight)
    right = clamp(right, safeLeft, safeRight)
    top = clamp(top, safeTop, safeBottom)
    bottom = clamp(bottom, safeTop, safeBottom)
    let width = right - left
    let height = bottom - top
    if (width < minSize) {
      if (direction.indexOf('left') >= 0 && direction.indexOf('right') < 0) {
        left = clamp(right - minSize, safeLeft, safeRight - minSize)
        right = left + minSize
      } else {
        right = clamp(left + minSize, safeLeft + minSize, safeRight)
        left = right - minSize
      }
      width = right - left
    }
    if (height < minSize) {
      if (direction.indexOf('top') >= 0 && direction.indexOf('bottom') < 0) {
        top = clamp(bottom - minSize, safeTop, safeBottom - minSize)
        bottom = top + minSize
      } else {
        bottom = clamp(top + minSize, safeTop + minSize, safeBottom)
        top = bottom - minSize
      }
      height = bottom - top
    }
    el.x = snap(left)
    el.y = snap(top)
    el.width = snap(width)
    el.height = snap(height)
    snapQrcode(el)
  }

  function snapMoveDelta (moving, actualDeltaX, actualDeltaY) {
    const snapThreshold = 4
    const paperH = state.tpl.paperSize.height
    const headerH = headerHeightOf(state.tpl)
    const footerH = footerHeightOf(state.tpl)
    const summaryATop = Number(state.tpl.summaryA)
    const summaryBTop = Number(state.tpl.summaryB)
    const groupMinX = Math.min(...moving.map((m) => m.x))
    const groupMinY = Math.min(...moving.map((m) => m.y))
    const groupMaxX = Math.max(...moving.map((m) => m.x + m.w))
    const groupMaxY = Math.max(...moving.map((m) => m.y + m.h))
    const newMinY = groupMinY + actualDeltaY
    const newMaxY = groupMaxY + actualDeltaY
    const headerLineBottom = headerH + 1
    const summaryALineBottom = summaryATop + 1
    const summaryBLineBottom = summaryBTop + 1
    const footerLineBottom = (paperH - footerH) + 1
    const labelMode = state.tpl.printKind === 'label'
    const showSummary = !labelMode && state.tpl.summaryEnabled !== false
    if (!labelMode && Math.abs(newMinY - headerH) <= snapThreshold) actualDeltaY = headerH - groupMinY
    else if (!labelMode && Math.abs(newMaxY - headerLineBottom) <= snapThreshold) actualDeltaY = headerLineBottom - groupMaxY
    else if (showSummary && Math.abs(newMinY - summaryATop) <= snapThreshold) actualDeltaY = summaryATop - groupMinY
    else if (showSummary && Math.abs(newMaxY - summaryALineBottom) <= snapThreshold) actualDeltaY = summaryALineBottom - groupMaxY
    else if (showSummary && Math.abs(newMinY - summaryBTop) <= snapThreshold) actualDeltaY = summaryBTop - groupMinY
    else if (showSummary && Math.abs(newMaxY - summaryBLineBottom) <= snapThreshold) actualDeltaY = summaryBLineBottom - groupMaxY
    else if (!labelMode && Math.abs(newMinY - (paperH - footerH)) <= snapThreshold) actualDeltaY = (paperH - footerH) - groupMinY
    else if (!labelMode && Math.abs(newMaxY - footerLineBottom) <= snapThreshold) actualDeltaY = footerLineBottom - groupMaxY
    const groupLeft = groupMinX
    const groupRight = groupMaxX
    const groupTop = groupMinY
    const groupBottom = groupMaxY
    const groupCenterX = (groupLeft + groupRight) / 2
    const groupCenterY = (groupTop + groupBottom) / 2
    const selectedIds = new Set(moving.map((m) => m.id))
    const candidates = (state.tpl.elements || []).filter((el) => !selectedIds.has(el.id))
    let bestSnapX = null
    let bestSnapY = null
    const consider = (dx, dy, distX, distY) => {
      if (typeof dx === 'number' && distX <= snapThreshold) {
        if (!bestSnapX || distX < bestSnapX.dist) bestSnapX = { delta: dx, dist: distX }
      }
      if (typeof dy === 'number' && distY <= snapThreshold) {
        if (!bestSnapY || distY < bestSnapY.dist) bestSnapY = { delta: dy, dist: distY }
      }
    }
    const getBorderW = (el) => (el && el.border && el.border.width ? Number(el.border.width) : 0)
    candidates.forEach((el) => {
      const elLeft = el.x
      const elRight = el.x + el.width
      const elTop = el.y
      const elBottom = el.y + el.height
      const elCenterX = (elLeft + elRight) / 2
      const elCenterY = (elTop + elBottom) / 2
      const targetBorderW = getBorderW(el)
      consider(elLeft - groupLeft, null, Math.abs((groupLeft + actualDeltaX) - elLeft), Infinity)
      consider(elRight - groupRight, null, Math.abs((groupRight + actualDeltaX) - elRight), Infinity)
      consider(elCenterX - groupCenterX, null, Math.abs((groupCenterX + actualDeltaX) - elCenterX), Infinity)
      consider((elLeft + targetBorderW) - groupRight, null, Math.abs((groupRight + actualDeltaX) - (elLeft + targetBorderW)), Infinity)
      consider((elRight - targetBorderW) - groupLeft, null, Math.abs((groupLeft + actualDeltaX) - (elRight - targetBorderW)), Infinity)
      consider(null, elTop - groupTop, Infinity, Math.abs((groupTop + actualDeltaY) - elTop))
      consider(null, elBottom - groupBottom, Infinity, Math.abs((groupBottom + actualDeltaY) - elBottom))
      consider(null, elCenterY - groupCenterY, Infinity, Math.abs((groupCenterY + actualDeltaY) - elCenterY))
      consider(null, (elTop + targetBorderW) - groupBottom, Infinity, Math.abs((groupBottom + actualDeltaY) - (elTop + targetBorderW)))
      consider(null, (elBottom - targetBorderW) - groupTop, Infinity, Math.abs((groupTop + actualDeltaY) - (elBottom - targetBorderW)))
    })
    if (bestSnapX) actualDeltaX = bestSnapX.delta
    if (bestSnapY) actualDeltaY = bestSnapY.delta
    return { actualDeltaX, actualDeltaY }
  }

  function writeBand (key, y) {
    const paperH = state.tpl.paperSize.height
    const headerH = headerHeightOf(state.tpl)
    const footerH = footerHeightOf(state.tpl)
    if (key === 'headerY') {
      const next = clamp(y, 10, paperH - footerH - 11)
      state.tpl.headerY = snap(next)
      state.tpl.headerHeight = snap(next)
      return
    }
    if (key === 'footerY') {
      const nextH = clamp(paperH - y, 11, paperH - headerH - 10)
      state.tpl.footerHeight = snap(nextH)
      state.tpl.footerY = snap(paperH - nextH)
      return
    }
    const minTop = headerH + 11
    const maxTop = paperH - footerH - 10
    const next = clamp(y, minTop, maxTop)
    state.tpl[key] = snap(next)
  }

  function bringToFront (id) {
    const node = paper.querySelector('[data-id="' + id + '"]')
    if (node && node.parentNode) node.parentNode.appendChild(node)
  }

  function startMoveDrag (id, startX, startY, ctrl) {
    if (!state.selected.has(id)) selectOnly(id, ctrl)
    bringToFront(id)
    const moving = [...state.selected].map((sid) => {
      const el = elById(state.tpl, sid)
      return { id: sid, x: el.x, y: el.y, w: el.width, h: el.height }
    })
    state.drag = { kind: 'move', x: startX, y: startY, moving }
  }

  function onMove (ev) {
    if (!state.drag) return
    const pt = paperPoint(paper, ev, state.scale)
    state.lastMouse = { x: pt.x, y: pt.y }
    if (state.drag.kind === 'pending-el') {
      if (Math.abs(ev.clientX - state.drag.clientX) <= 3 && Math.abs(ev.clientY - state.drag.clientY) <= 3) return
      startMoveDrag(state.drag.id, state.drag.x, state.drag.y, state.drag.ctrl || ev.ctrlKey || ev.metaKey)
    }
    if (state.drag.kind === 'move') {
      const paperW = state.tpl.paperSize.width
      const paperH = state.tpl.paperSize.height
      const safe = REPORT_SAFE_MARGIN_PX
      let dx = pt.x - state.drag.x
      let dy = pt.y - state.drag.y
      const moving = state.drag.moving
      const groupMinX = Math.min(...moving.map((m) => m.x))
      const groupMinY = Math.min(...moving.map((m) => m.y))
      const groupMaxX = Math.max(...moving.map((m) => m.x + m.w))
      const groupMaxY = Math.max(...moving.map((m) => m.y + m.h))
      if (groupMinX + dx < safe) dx -= (groupMinX + dx - safe)
      else if (groupMaxX + dx > paperW - safe) dx -= (groupMaxX + dx - (paperW - safe))
      if (groupMinY + dy < safe) dy -= (groupMinY + dy - safe)
      else if (groupMaxY + dy > paperH - safe) dy -= (groupMaxY + dy - (paperH - safe))
      if (ev.ctrlKey || ev.metaKey) {
        const snapped = snapMoveDelta(moving, dx, dy)
        dx = snapped.actualDeltaX
        dy = snapped.actualDeltaY
      }
      for (const m of moving) {
        const el = elById(state.tpl, m.id)
        if (!el) continue
        el.x = snap(m.x + dx)
        el.y = snap(m.y + dy)
      }
      paintPaper()
    } else if (state.drag.kind === 'resize') {
      const dx = pt.x - state.drag.x
      const dy = pt.y - state.drag.y
      const dir = state.drag.handle
      const list = state.drag.ctrl && state.drag.resizing.length ? state.drag.resizing : state.drag.resizing.slice(0, 1)
      for (const rec of list) {
        const el = elById(state.tpl, rec.id)
        if (!el) continue
        applyResizeRect(el, rec, dx, dy, dir)
      }
      paintPaper()
    } else if (state.drag.kind === 'band') {
      let y = pt.y
      if (ev.ctrlKey || ev.metaKey) {
        let best = y
        let bestD = 6
        for (const el of state.tpl.elements || []) {
          for (const edge of [el.y, el.y + el.height]) {
            const d = Math.abs(edge - y)
            if (d <= bestD) { bestD = d; best = edge }
          }
        }
        y = best
      }
      writeBand(state.drag.key, y)
      paintGuides()
    } else if (state.drag.kind === 'marquee') {
      const box = paper.querySelector('.selection-box')
      if (!box) return
      const x = Math.min(state.drag.x, pt.x)
      const y = Math.min(state.drag.y, pt.y)
      const w = Math.abs(pt.x - state.drag.x)
      const h = Math.abs(pt.y - state.drag.y)
      box.style.left = x + 'px'
      box.style.top = y + 'px'
      box.style.width = w + 'px'
      box.style.height = h + 'px'
    }
  }

  function onUp (ev) {
    if (!state.drag) return
    const kind = state.drag.kind
    if (kind === 'pending-el') {
      const id = state.drag.id
      const ctrl = ev.ctrlKey || ev.metaKey || state.drag.ctrl
      const dbl = ev.detail >= 2
      state.drag = null
      selectOnly(id, ctrl)
      bringToFront(id)
      if (dbl) beginEdit(elById(state.tpl, id))
      return
    }
    if (kind === 'marquee') {
      const pt = paperPoint(paper, ev, state.scale)
      const box = {
        x: Math.min(state.drag.x, pt.x),
        y: Math.min(state.drag.y, pt.y),
        width: Math.abs(pt.x - state.drag.x),
        height: Math.abs(pt.y - state.drag.y)
      }
      const hit = paper.querySelector('.selection-box')
      if (hit) hit.remove()
      if (box.width > 2 && box.height > 2) {
        if (!(ev.ctrlKey || ev.metaKey)) state.selected.clear()
        for (const el of state.tpl.elements) {
          if (intersects(box, el)) state.selected.add(el.id)
        }
      }
      state.drag = null
      paintToolbar()
      paintPaper()
      if (state.leftTab === 'prop') paintProps()
      fire(host, 'select', { ids: [...state.selected] })
      return
    }
    state.drag = null
    commit()
  }

  doc.addEventListener('mousemove', onMove)
  doc.addEventListener('mouseup', onUp)

  function moveSelectedBy (dx, dy) {
    const els = selectedEls()
    if (!els.length) return false
    const paperW = state.tpl.paperSize.width
    const paperH = state.tpl.paperSize.height
    const safe = REPORT_SAFE_MARGIN_PX
    let minX = Math.min(...els.map((e) => e.x))
    let minY = Math.min(...els.map((e) => e.y))
    let maxX = Math.max(...els.map((e) => e.x + e.width))
    let maxY = Math.max(...els.map((e) => e.y + e.height))
    let adx = dx
    let ady = dy
    if (minX + adx < safe) adx -= (minX + adx - safe)
    else if (maxX + adx > paperW - safe) adx -= (maxX + adx - (paperW - safe))
    if (minY + ady < safe) ady -= (minY + ady - safe)
    else if (maxY + ady > paperH - safe) ady -= (maxY + ady - (paperH - safe))
    for (const el of els) {
      el.x = snap(el.x + adx)
      el.y = snap(el.y + ady)
    }
    return true
  }

  function resizeSelectedBy (dw, dh) {
    const els = selectedEls()
    if (!els.length) return false
    const paperW = state.tpl.paperSize.width
    const paperH = state.tpl.paperSize.height
    const safe = REPORT_SAFE_MARGIN_PX
    for (const el of els) {
      let w = snap(Math.max(10, (el.width || 100) + dw))
      let h = snap(Math.max(10, (el.height || 25) + dh))
      if (el.x + w > paperW - safe) w = snap(Math.max(10, paperW - safe - el.x))
      if (el.y + h > paperH - safe) h = snap(Math.max(10, paperH - safe - el.y))
      el.width = w
      el.height = h
    }
    return true
  }

  function copySelected () {
    const els = selectedEls().map((e) => cloneJson(e)).filter(Boolean)
    state.clipboard = els
    try {
      localStorage.setItem(CROSS_TAB_CLIPBOARD_KEY, JSON.stringify({ elements: els, timestamp: Date.now() }))
    } catch { /* ignore */ }
  }

  function pasteClipboard () {
    let srcs = state.clipboard
    try {
      const raw = localStorage.getItem(CROSS_TAB_CLIPBOARD_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        if (data && Date.now() - data.timestamp < 3600000 && Array.isArray(data.elements) && data.elements.length) srcs = data.elements
      }
    } catch { /* ignore */ }
    if (!srcs || !srcs.length) return
    const paperW = state.tpl.paperSize.width
    const paperH = state.tpl.paperSize.height
    const safe = REPORT_SAFE_MARGIN_PX
    let pasteX = state.lastMouse.x
    let pasteY = state.lastMouse.y
    if (!pasteX && !pasteY) {
      pasteX = (srcs[0].x || 0) + 20
      pasteY = (srcs[0].y || 0) + 20
    }
    const minX = Math.min(...srcs.map((e) => e.x))
    const minY = Math.min(...srcs.map((e) => e.y))
    const maxX = Math.max(...srcs.map((e) => e.x + e.width))
    const maxY = Math.max(...srcs.map((e) => e.y + e.height))
    if (pasteX < safe) pasteX = safe
    if (pasteY < safe) pasteY = safe
    if (pasteX + (maxX - minX) > paperW - safe) pasteX = paperW - safe - (maxX - minX)
    if (pasteY + (maxY - minY) > paperH - safe) pasteY = paperH - safe - (maxY - minY)
    state.selected.clear()
    for (const src of srcs) {
      const el = cloneJson(src)
      el.id = createElement(el.type, { x: 0, y: 0 }).id
      el.x = snap(pasteX + (src.x - minX))
      el.y = snap(pasteY + (src.y - minY))
      state.tpl.elements.push(el)
      state.selected.add(el.id)
    }
    commit()
  }

  wrap.addEventListener('keydown', (ev) => {
    const ctrl = ev.ctrlKey || ev.metaKey
    if (ctrl && ev.target && ev.target.closest && ev.target.closest('.paper-controls')) {
      if (ev.key.toLowerCase() === 'z') {
        ev.preventDefault()
        const snapShot = ev.shiftKey ? hist.redo() : hist.undo()
        if (snapShot) setTpl(snapShot, false)
        wrap.focus()
        return
      }
      if (ev.key.toLowerCase() === 'y') {
        ev.preventDefault()
        const snapShot = hist.redo()
        if (snapShot) setTpl(snapShot, false)
        wrap.focus()
        return
      }
    }
    const tag = ev.target && ev.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || ev.target.isContentEditable) {
      if (ev.key === 'Escape') ev.target.blur()
      return
    }
    if (ctrl && ev.key.toLowerCase() === 'z') {
      ev.preventDefault()
      const snapShot = ev.shiftKey ? hist.redo() : hist.undo()
      if (snapShot) setTpl(snapShot, false)
      return
    }
    if (ctrl && ev.key.toLowerCase() === 'y') {
      ev.preventDefault()
      const snapShot = hist.redo()
      if (snapShot) setTpl(snapShot, false)
      return
    }
    if (ctrl && ev.key.toLowerCase() === 'c') {
      ev.preventDefault()
      copySelected()
      return
    }
    if (ctrl && ev.key.toLowerCase() === 'v') {
      ev.preventDefault()
      pasteClipboard()
      return
    }
    if (ev.key === 'Escape') {
      const root = host.shadowRoot || host
      if (root.querySelector('.npt-preview.el-overlay:not([hidden]), .el-overlay.npt-mask, .npt-mask')) return
      ev.preventDefault()
      if (state.tbMenu) {
        closeTbMenus()
        return
      }
      selectOnly(null, false)
      return
    }
    if (ev.key === 'Delete') {
      ev.preventDefault()
      state.tpl.elements = state.tpl.elements.filter((e) => !state.selected.has(e.id))
      state.selected.clear()
      commit()
      return
    }
    const arrow = ev.key === 'ArrowLeft' || ev.key === 'ArrowRight' || ev.key === 'ArrowUp' || ev.key === 'ArrowDown'
    if (!arrow) return
    const sx = ev.key === 'ArrowLeft' ? -1 : (ev.key === 'ArrowRight' ? 1 : 0)
    const sy = ev.key === 'ArrowUp' ? -1 : (ev.key === 'ArrowDown' ? 1 : 0)
    if (ctrl && ev.shiftKey) {
      ev.preventDefault()
      if (moveSelectedBy(sx * 6, sy * 6)) commit()
      return
    }
    if (ctrl) {
      ev.preventDefault()
      if (moveSelectedBy(sx, sy)) commit()
      return
    }
    if (ev.shiftKey) {
      ev.preventDefault()
      if (resizeSelectedBy(sx, sy)) commit()
    }
  })

  const innerTabs = wrap.querySelector('.nd-tabs')
  if (innerTabs) {
    innerTabs.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-tab]')
      if (!btn) return
      state.leftTab = btn.dataset.tab
      wrap.querySelectorAll('.left [data-tab]').forEach((b) => b.classList.toggle('on', b === btn))
      paintLeft()
    })
  }

  bar.addEventListener('change', (ev) => {
    const act = ev.target.dataset.act
    if (act === 'summary') {
      state.tpl.summaryEnabled = ev.target.checked
      commit()
    }
    if (act === 'mmw' || act === 'mmh') {
      const wEl = bar.querySelector('[data-act=mmw]')
      const hEl = bar.querySelector('[data-act=mmh]')
      const w = wEl ? Number(wEl.value) : 0
      const h = hEl ? Number(hEl.value) : 0
      if (w > 0 && h > 0) {
        applyCustomPaperMm(state.tpl, w, h, state.tpl.paperOrientation)
        commit()
      }
    }
    if (act === 'bc') {
      applyBorderPen(true, false)
      setTimeout(() => { state.holdBorderColor = false }, 300)
    }
    if (act === 'color') {
      if (applyTextStyle(state.tpl, state.selected, 'color', ev.target.value)) commit()
    }
    if (act === 'bg') {
      if (applyTextStyle(state.tpl, state.selected, 'backgroundColor', ev.target.value)) commit()
    }
    if (act === 'fontFamily') {
      if (ev.target.value === '__tk_font_family_mixed__') return
      if (applyTextStyle(state.tpl, state.selected, 'fontFamily', ev.target.value)) commit()
    }
    if (act === 'fontSize') {
      if (applyTextStyle(state.tpl, state.selected, 'fontSize', Number(ev.target.value))) commit()
    }
    if (act === 'barfmt') {
      if (applyBarcodeFormat(state.tpl, state.selected, ev.target.value, 'barcode')) commit()
    }
    if (act === 'qrfmt') {
      if (applyBarcodeFormat(state.tpl, state.selected, ev.target.value, 'qrcode')) commit()
    }
  })

  bar.addEventListener('input', (ev) => {
    const act = ev.target.dataset.act
    if (act === 'color' && applyTextStyle(state.tpl, state.selected, 'color', ev.target.value)) paintPaper()
    if (act === 'bg' && applyTextStyle(state.tpl, state.selected, 'backgroundColor', ev.target.value)) paintPaper()
    if (act === 'bc') {
      state.holdBorderColor = true
      applyBorderPen(false)
    }
  })

  bar.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act]')
    if (!btn || !bar.contains(btn)) return
    const act = btn.dataset.act
    if (act === 'orient') {
      const picked = btn.value === 'landscape' || btn.value === 'portrait' ? btn.value : ''
      const next = picked || (state.tpl.paperOrientation === 'landscape' ? 'portrait' : 'landscape')
      if (state.tpl.paperPreset === 'CUSTOM') {
        applyCustomPaperMm(state.tpl, state.tpl.customPaperSizeMm ? state.tpl.customPaperSizeMm.width : pxToMm(state.tpl.paperSize.width), state.tpl.customPaperSizeMm ? state.tpl.customPaperSizeMm.height : pxToMm(state.tpl.paperSize.height), next)
      } else applyPaperPreset(state.tpl, state.tpl.paperPreset || 'A4', next)
      commit()
      return
    }
    const ids = state.selected
    if (act === 'alignx' && alignX(state.tpl, ids)) commit()
    if (act === 'aligny' && alignY(state.tpl, ids)) commit()
    if (act === 'centerh' && centerH(state.tpl, ids)) commit()
    if (act === 'centerv' && centerV(state.tpl, ids)) commit()
    if (act === 'space' && spaceAround(state.tpl, ids)) commit()
    if (act === 'syncw' && syncColumnWidths(state.tpl, ids)) commit()
    if (act === 'menu-kind' || act === 'menu-paper' || act === 'menu-print' || act === 'menu-border') {
      openTbMenu(act.slice(5))
      return
    }
    if (act === 'kind') {
      applyPrintKind(state.tpl, btn.dataset.val)
      closeTbMenus()
      commit()
      return
    }
    if (act === 'preset') {
      const picked = btn.dataset.val
      closeTbMenus()
      if (picked === 'custom' || picked === 'CUSTOM') {
        const wmm = state.tpl.customPaperSizeMm && state.tpl.customPaperSizeMm.width > 0
          ? state.tpl.customPaperSizeMm.width
          : pxToMm(state.tpl.paperSize && state.tpl.paperSize.width)
        const hmm = state.tpl.customPaperSizeMm && state.tpl.customPaperSizeMm.height > 0
          ? state.tpl.customPaperSizeMm.height
          : pxToMm(state.tpl.paperSize && state.tpl.paperSize.height)
        applyCustomPaperMm(state.tpl, wmm, hmm, state.tpl.paperOrientation)
        commit()
        return
      }
      applyPaperPreset(state.tpl, picked, state.tpl.paperOrientation)
      commit()
      return
    }
    if (act === 'bw-pick' || act === 'bs-pick') {
      const key = act === 'bw-pick' ? 'bw' : 'bs'
      const hidden = bar.querySelector('[data-act=' + key + ']')
      if (hidden) hidden.value = btn.dataset.val
      applyBorderPen(true, true)
      return
    }
    if (act === 'border-toggle') {
      if (!ids.size) return
      closeTbMenus()
      state.borderDraft = readBorderDraft(bar)
      if (toggleMainBorder(state.tpl, ids, state.borderDraft)) commit()
      return
    }
    if (act === 'border-all') {
      if (!ids.size) return
      state.borderDraft = readBorderDraft(bar)
      closeTbMenus()
      if (setBorderOn(state.tpl, ids, state.borderDraft)) commit()
      return
    }
    if (act === 'border-none') {
      if (!ids.size) return
      closeTbMenus()
      if (setBorderOff(state.tpl, ids)) commit()
      return
    }
    if (act === 'border-top' || act === 'border-right' || act === 'border-bottom' || act === 'border-left') {
      if (!ids.size) return
      state.borderDraft = readBorderDraft(bar)
      closeTbMenus()
      if (toggleBorderSide(state.tpl, ids, state.borderDraft, act.slice('border-'.length))) commit()
      return
    }
    if (act === 'bold') {
      const on = selectedEls().some((e) => e.style && (e.style.fontWeight === 'bold' || e.style.fontWeight === '700'))
      if (applyTextStyle(state.tpl, ids, 'fontWeight', on ? 'normal' : 'bold')) commit()
    }
    if (act === 'italic') {
      const on = selectedEls().some((e) => e.style && e.style.fontStyle === 'italic')
      if (applyTextStyle(state.tpl, ids, 'fontStyle', on ? 'normal' : 'italic')) commit()
    }
    if (act === 'under') {
      const on = selectedEls().some((e) => e.style && e.style.textDecoration === 'underline')
      if (applyTextStyle(state.tpl, ids, 'textDecoration', on ? 'none' : 'underline')) commit()
    }
    if (act === 'strike') {
      const on = selectedEls().some((e) => e.style && e.style.textDecoration === 'line-through')
      if (applyTextStyle(state.tpl, ids, 'textDecoration', on ? 'none' : 'line-through')) commit()
    }
    if (act === 'talign') {
      const cur = (selectedEls()[0] && selectedEls()[0].textAlign) || 'center'
      const next = cur === 'left' ? 'center' : (cur === 'center' ? 'right' : 'left')
      if (applyTextStyle(state.tpl, ids, 'textAlign', next)) commit()
    }
    if (act === 'valign') {
      const cur = (selectedEls()[0] && selectedEls()[0].verticalAlign) || 'top'
      const next = cur === 'top' ? 'center' : (cur === 'center' ? 'bottom' : 'top')
      if (applyTextStyle(state.tpl, ids, 'verticalAlign', next)) commit()
    }
    if (act === 'merge') {
      const els = selectedEls()
      const check = validateMergeSelectionV2(els)
      if (!check.ok) {
        fire(host, 'error', new Error(check.reasonKey || '不能合并'))
        return
      }
      const sorted = els.slice().sort((a, b) => a.y - b.y || a.x - b.x)
      const merged = buildMergedElementFromSorted(sorted, check.bbox)
      const drop = new Set(els.map((e) => e.id))
      state.tpl.elements = state.tpl.elements.filter((e) => !drop.has(e.id))
      state.tpl.elements.push(merged)
      state.selected = new Set([merged.id])
      commit()
    }
    if (act === 'preview' || act === 'print' || act === 'save' || act === 'frontend-print' || act === 'pdf-print' || act === 'frontend-jump' || act === 'pdf-jump') {
      closeTbMenus()
      paintToolbar()
    }
    if (typeof opts.onToolbarClick === 'function') opts.onToolbarClick(act, ev)
  })

  doc.addEventListener('pointerdown', (ev) => {
    if (!state.tbMenu) return
    if (state.holdBorderColor) return
    const open = bar.querySelector('.tb-drop.is-open')
    if (eventIn(open, ev)) return
    closeTbMenus()
  }, true)

  bar.addEventListener('pointerdown', (ev) => {
    const color = ev.target.closest && ev.target.closest('[data-act=bc]')
    if (color && bar.contains(color)) {
      state.holdBorderColor = true
      state.tbMenu = 'border'
    }
  }, true)

  if (leftPane) {
    function applyPropToSelected (key, raw) {
      const targets = selectedEls()
      if (!targets.length) return
      if (key === 'x' && !canBatchModifyX()) return
      if (key === 'y' && !canBatchModifyY()) return
      for (const el of targets) {
        if (key === 'type') {
          if (canConvertType(el.type, raw)) {
            el.type = raw
            if (raw === 'barcode' && !el.barcodeFormat) el.barcodeFormat = 'code128'
            if (raw === 'qrcode' && !el.qrcodeFormat) el.qrcodeFormat = 'qrcode'
          }
        } else if (key === 'x' || key === 'y' || key === 'width' || key === 'height') {
          el[key] = Number(raw) || 0
        } else if (key === 'decimalPlaces') {
          const s = String(raw == null ? '' : raw).trim()
          if (s === '') el.decimalPlaces = 'auto'
          else {
            let n = Math.trunc(Number(s))
            if (!Number.isFinite(n)) el.decimalPlaces = 'auto'
            else {
              if (n < 0) n = 0
              if (n > 10) n = 10
              el.decimalPlaces = String(n)
            }
          }
        } else if (key === 'tolerateNullish' || key === 'shrinkToFit' || key === 'useGrouping') {
          el[key] = raw === true || raw === '1'
        } else if (key === 'mergeGroupBy' || key === 'mergeSumField' || key === 'rowCondBgPath') {
          el[key] = raw == null || raw === '' ? '' : String(raw).trim()
        } else if (key === 'content' || key === 'barcodeFormat' || key === 'qrcodeFormat' || key === 'mergeVerticalAlign' || key === 'textAlign' || key === 'verticalAlign' || key === 'formatType' || key === 'mergeMode' || key === 'dateFormat' || key === 'numberFormat' || key === 'roundingMode' || key === 'currencySymbol' || key === 'rowCondBgColor' || key === 'rowCondBgOp' || key === 'rowCondBgValue') {
          el[key] = raw
        } else if (key === 'barcodeDisplayValue') {
          el.barcodeDisplayValue = raw === true || raw === '1'
        } else if (key === 'padding') {
          el.padding = Number(raw)
        } else if (key === 'fill') {
          el.style = { ...(el.style || {}), backgroundColor: raw }
        } else if (key === 'color' || key === 'fontSize' || key === 'fontFamily' || key === 'fontWeight') {
          el.style = { ...(el.style || {}), [key]: raw }
        }
        if (key === 'mergeMode' && raw === 'none') {
          el.mergeGroupBy = ''
          el.mergeSumField = ''
          el.mergeVerticalAlign = 'none'
        }
        snapQrcode(el)
      }
    }

    leftPane.addEventListener('change', (ev) => {
      const key = ev.target.dataset.p
      if (!key) return
      if (key === 'image') {
        const el = elById(state.tpl, [...state.selected][0])
        const f = ev.target.files && ev.target.files[0]
        if (!el || !f) return
        if (!f.type.startsWith('image/')) {
          toast(host, ht(host, 'designer.properties.selectImageFile'))
          ev.target.value = ''
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          el.content = String(reader.result || '')
          commit()
        }
        reader.readAsDataURL(f)
        return
      }
      applyPropToSelected(key, ev.target.value)
      commit()
    })

    leftPane.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-p]')
      if (!btn) return
      if (btn.classList.contains('npt-switch')) {
        const on = btn.dataset.on !== '1'
        applyPropToSelected(btn.dataset.p, on)
        commit()
        return
      }
      if (btn.dataset.p === 'rowCondBgClear') {
        for (const el of selectedEls()) {
          el.rowCondBgPath = ''
          el.rowCondBgOp = 'eq'
          el.rowCondBgValue = ''
          el.rowCondBgColor = ''
        }
        commit()
      }
      if (btn.dataset.p === 'clearImage') {
        for (const el of selectedEls()) {
          if (el.type === 'image') el.content = ''
        }
        commit()
      }
    })

    leftPane.addEventListener('input', (ev) => {
      const key = ev.target.dataset.p
      if (!key) return
      if (key === 'x' || key === 'y' || key === 'width' || key === 'height' || key === 'currencySymbol' || key === 'decimalPlaces' || key === 'rowCondBgColor' || key === 'rowCondBgValue' || key === 'rowCondBgPath' || key === 'mergeGroupBy' || key === 'mergeSumField') {
        applyPropToSelected(key, ev.target.value)
        if (key === 'x' || key === 'y' || key === 'width' || key === 'height') paintPaper()
      }
    })
  }

  if (rightPane) {
    rightPane.addEventListener('click', (ev) => {
      if (ev.target.dataset.field) {
        const id = [...state.selected][0]
        const el = id ? elById(state.tpl, id) : null
        if (el && (el.type === 'text' || el.type === 'data' || el.type === 'barcode' || el.type === 'qrcode')) {
          el.content = (el.content || '') + fieldExpr(ev.target.dataset.field)
          syncTextDataType(el)
          commit()
        }
      }
      if (ev.target.dataset.act === 'applyds') {
        const ta = rightPane.querySelector('[data-ds]')
        try {
          state.tpl.dataset = JSON.parse(ta.value)
          commit()
        } catch (err) {
          fire(host, 'error', err)
        }
      }
    })
  }

  canvasWrap.addEventListener('wheel', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return
    ev.preventDefault()
    const next = Math.max(0.1, Math.min(5, state.scale + (ev.deltaY > 0 ? -0.1 : 0.1)))
    if (next === state.scale) return
    state.scale = Math.round(next * 100) / 100
    paintPaper()
  }, { passive: false })

  canvasWrap.addEventListener('mousemove', (ev) => {
    const pt = paperPoint(paper, ev, state.scale)
    state.lastMouse = { x: pt.x, y: pt.y }
    if (ev.target === paper || paper.contains(ev.target)) {
      const xy = canvasWrap.querySelector('[data-xy]')
      if (xy) xy.textContent = 'X: ' + Math.round(pt.x) + ', Y: ' + Math.round(pt.y)
    }
  })
  canvasWrap.addEventListener('click', (ev) => {
    if (ev.target === canvasWrap || ev.target === paperBox || ev.target === paper) {
      if (!(ev.ctrlKey || ev.metaKey)) selectOnly(null, false)
    }
  })

  function onStorage (ev) {
    if (ev.key !== CROSS_TAB_CLIPBOARD_KEY) return
    try {
      const data = JSON.parse(ev.newValue || '')
      if (data && Array.isArray(data.elements)) state.clipboard = data.elements
    } catch { /* ignore */ }
  }
  const win = doc.defaultView
  if (win) win.addEventListener('storage', onStorage)

  paintAll()
  fire(host, 'load', { template: exportTemplate(state.tpl) })

  return {
    getTemplate () { return exportTemplate(state.tpl) },
    setTemplate (tpl) { setTpl(tpl, true) },
    resetHistory () { hist.reset(state.tpl) },
    getData () { return cloneJson(state.tpl.dataset) },
    setData (ds, silent) {
      state.tpl.dataset = ds
      if (silent) {
        emitChange()
        return
      }
      commit()
    },
    getParam () { return cloneJson(state.tpl.param || {}) },
    setParam (p, silent) {
      state.tpl.param = p && typeof p === 'object' ? p : {}
      if (silent) {
        emitChange()
        return
      }
      commit()
    },
    setPageBackground (bg) {
      state.tpl.pageBackground = bg || null
      commit()
    },
    setLeftTab (tab) {
      state.leftTab = tab === 'prop' ? 'prop' : 'comp'
      paintLeft()
    },
    insertField (field) {
      if (state.editBox) {
        insertFieldIntoEditBox(field)
        return true
      }
      const id = [...state.selected][0]
      const el = id ? elById(state.tpl, id) : null
      if (!el) return false
      const expr = String(field || '')
      if (expr.indexOf(',') >= 0 && expr.indexOf('${') < 0) {
        el.content = (el.content || '') + String(expr).split(',').map((s) => fieldExpr(s)).join('')
      } else {
        el.content = (el.content || '') + (expr.indexOf('${') === 0 ? expr : fieldExpr(expr))
      }
      syncTextDataType(el)
      commit()
      return true
    },
    recalculateGroupAndPrevNode () {
      refreshGroups(state.tpl)
    },
    getSelectedIds () { return [...state.selected] },
    getSelectedElements () { return selectedEls() },
    undo () {
      const snap = hist.undo()
      if (snap) setTpl(snap, false)
    },
    redo () {
      const snap = hist.redo()
      if (snap) setTpl(snap, false)
    },
    destroy () {
      doc.removeEventListener('mousemove', onMove)
      doc.removeEventListener('mouseup', onUp)
      if (win) win.removeEventListener('storage', onStorage)
    }
  }
}

export { createBlankTemplate }
