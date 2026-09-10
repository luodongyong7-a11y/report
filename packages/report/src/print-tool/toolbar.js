import { borderSidesOf, borderStateOf } from '../designer/align.js'
import { validateMergeSelectionV2 } from '../designer/merge.js'

const DESIGNER_FONT_WHITELIST = [
  { value: '', labelKey: 'designer.toolbar.fontAuto' },
  { value: 'SimSun', labelKey: 'designer.toolbar.fontSimSun' },
  { value: 'SimHei', labelKey: 'designer.toolbar.fontSimHei' },
  { value: 'Times New Roman' }
]

const ICON = {
  alignX: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v1H2zm0 3h12v1H2zm0 3h12v1H2zm0 3h12v1H2z"/></svg>',
  alignY: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2v12h1V2zm3 0v12h1V2zm3 0v12h1V2zm3 0v12h1V2z"/></svg>',
  syncW: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12v2H2zM2 6h5v2H2zM2 10h5v2H2zM9 6h5v2H9zM9 10h5v2H9z"/></svg>',
  centerH: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="6" width="12" height="4" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="8" cy="8" r="1" fill="currentColor"/></svg>',
  centerV: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="6" y="2" width="4" height="12" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="8" cy="8" r="1" fill="currentColor"/></svg>',
  space: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 4h2v1H1zm4 0h2v1H5zm4 0h2v1H9zm4 0h2v1h-2zM1 8h2v1H1zm4 0h2v1H5zm4 0h2v1H9zm4 0h2v1h-2zM1 12h2v1H1zm4 0h2v1H5zm4 0h2v1H9zm4 0h2v1h-2z"/></svg>',
  portrait: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="1.5" width="8" height="13" rx="1"/></svg>',
  landscape: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="4" width="13" height="8" rx="1"/></svg>',
  borderAll: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="2.5" width="11" height="11"/><path d="M8 2.5v11M2.5 8h11"/></svg>',
  borderLine: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="10" height="10"/></svg>',
  borderMixed: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="10" height="10" stroke-dasharray="2 2"/><path d="M6 8h4" stroke-linecap="round"/></svg>',
  borderNone: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="2.5" width="11" height="11"/><path d="M4 12L12 4"/></svg>',
  borderBottom: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><rect x="3" y="3" width="10" height="10" stroke-width="1" opacity=".35"/><path d="M3 13h10" stroke-width="1.8"/></svg>',
  borderTop: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><rect x="3" y="3" width="10" height="10" stroke-width="1" opacity=".35"/><path d="M3 3h10" stroke-width="1.8"/></svg>',
  borderLeft: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><rect x="3" y="3" width="10" height="10" stroke-width="1" opacity=".35"/><path d="M3 3v10" stroke-width="1.8"/></svg>',
  borderRight: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><rect x="3" y="3" width="10" height="10" stroke-width="1" opacity=".35"/><path d="M13 3v10" stroke-width="1.8"/></svg>',
  fill: '<svg width="12" height="10" viewBox="0 0 12 10"><rect x="0.5" y="0.5" width="11" height="9" rx="1" fill="#fff" stroke="currentColor"/></svg>'
}

function esc (s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function commonValue (els, get) {
  if (!els.length) return { mixed: false, value: '' }
  const first = get(els[0])
  for (let i = 1; i < els.length; i++) {
    if (get(els[i]) !== first) return { mixed: true, value: first }
  }
  return { mixed: false, value: first }
}

function dashAttr (style) {
  if (style === 'dashed') return ' stroke-dasharray="3 2"'
  if (style === 'dotted') return ' stroke-dasharray="1.2 1.6"'
  return ''
}

function borderFaceIcon (sides, style, width) {
  const s = sides || {}
  const sw = Math.max(1.2, Math.min(2.6, 0.8 + Number(width || 1) * 0.35))
  const on = 'fill="none" stroke="#111827" stroke-width="' + sw + '" stroke-linecap="square"' + dashAttr(style)
  const off = 'fill="none" stroke="#c0c4cc" stroke-width="1.2" stroke-linecap="square"'
  return '<svg width="16" height="16" viewBox="0 0 16 16">' +
    '<path d="M3.2 3.2h9.6" ' + (s.top ? on : off) + '/>' +
    '<path d="M12.8 3.2v9.6" ' + (s.right ? on : off) + '/>' +
    '<path d="M3.2 12.8h9.6" ' + (s.bottom ? on : off) + '/>' +
    '<path d="M3.2 3.2v9.6" ' + (s.left ? on : off) + '/>' +
    '</svg>'
}

function fillFaceIcon (color, mixed) {
  if (mixed) {
    return '<svg width="14" height="12" viewBox="0 0 14 12"><rect x="0.5" y="0.5" width="13" height="11" rx="1" fill="#fff" stroke="#9ca3af"/><path d="M1 11L13 1" stroke="#9ca3af"/></svg>'
  }
  return '<svg width="14" height="12" viewBox="0 0 14 12"><rect x="0.5" y="0.5" width="13" height="11" rx="1" fill="' + esc(color || '#ffffff') + '" stroke="#9ca3af"/></svg>'
}

function dropCaret () {
  return '<span class="tb-drop__caret" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.2 3.4L5 6.4L7.8 3.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
}

function dropItem (act, val, label, on) {
  return '<button type="button" class="tb-drop__item' + (on ? ' is-on' : '') + '" data-act="' + esc(act) + '" data-val="' + esc(val) + '">' +
    '<span class="tb-drop__check">' + (on ? '✓' : '') + '</span>' +
    '<span>' + esc(label) + '</span></button>'
}

function firstStyle (els) {
  const el = els[0]
  return (el && el.style) || {}
}

function alignIcon (align) {
  if (align === 'left') return '←'
  if (align === 'right') return '→'
  return '↔'
}

function valignIcon (align) {
  if (align === 'top') return '↑'
  if (align === 'bottom') return '↓'
  return '⇅'
}

function alignTitle (align) {
  if (align === 'left') return '左对齐（点击切换）'
  if (align === 'right') return '右对齐（点击切换）'
  return '居中对齐（点击切换）'
}

function valignTitle (align) {
  if (align === 'top') return '顶部对齐（点击切换）'
  if (align === 'bottom') return '底部对齐（点击切换）'
  return '垂直居中（点击切换）'
}

const FONT_LABEL = {
  'designer.toolbar.fontAuto': '自动',
  'designer.toolbar.fontSimSun': '宋体',
  'designer.toolbar.fontSimHei': '黑体',
  'designer.toolbar.fontKaiTi': '楷体',
  'designer.toolbar.fontFangSong': '仿宋',
  'designer.toolbar.fontYaHei': '微软雅黑',
  'designer.toolbar.fontJhengHei': '微软正黑体',
  'designer.toolbar.fontDengXian': '等线',
  'designer.toolbar.fontArial': 'Arial'
}

const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24]

export function renderToolbar (tpl, selectedEls, ui) {
  const tr = (key) => (ui && typeof ui.t === 'function' ? ui.t(key) : key)
  const preset = tpl.paperPreset === 'CUSTOM' ? 'custom' : (tpl.paperPreset || 'A4')
  const orient = tpl.paperOrientation === 'landscape' ? 'landscape' : 'portrait'
  const mmw = tpl.customPaperSizeMm ? tpl.customPaperSizeMm.width : ''
  const mmh = tpl.customPaperSizeMm ? tpl.customPaperSizeMm.height : ''
  const st = firstStyle(selectedEls)
  const hasSel = selectedEls.length > 0
  const canMerge = validateMergeSelectionV2(selectedEls).ok
  const fontVals = selectedEls.map((e) => ((e && e.style) || {}).fontFamily || '')
  const fontMixed = fontVals.length > 1 && fontVals.some((f) => f !== fontVals[0])
  const curFont = (!fontMixed && st.fontFamily) ? String(st.fontFamily) : ''
  const fontList = DESIGNER_FONT_WHITELIST.slice()
  if (curFont && !fontList.some((o) => o.value === curFont)) fontList.push({ value: curFont })
  const fontOpts = (fontMixed ? '<option value="__tk_font_family_mixed__" selected>' + esc(tr('designer.toolbar.fontMixed') || '混合') + '</option>' : '') +
    fontList.map((opt) => {
      const v = opt.value == null ? '' : String(opt.value)
      const lab = (opt.labelKey && (ui && ui.t ? ui.t(opt.labelKey) : FONT_LABEL[opt.labelKey])) || v || tr('designer.toolbar.fontAuto')
      return '<option value="' + esc(v) + '"' + (!fontMixed && st.fontFamily === v ? ' selected' : '') + '>' + esc(lab) + '</option>'
    }).join('')
  const fsNum = parseFloat(st.fontSize) || 10
  const draft = (ui && ui.borderDraft) || {}
  const elB = selectedEls[0] && selectedEls[0].border
  const bw = Number((elB && elB.width) || draft.width || 1) || 1
  const bs = (elB && elB.style) || draft.style || 'solid'
  const bc = (elB && elB.color) || draft.color || '#000000'
  const sides = borderSidesOf(elB)
  const allOn = sides.top && sides.right && sides.bottom && sides.left
  const noneOn = !sides.top && !sides.right && !sides.bottom && !sides.left
  const borderState = borderStateOf(selectedEls)
  const faceMixed = borderState === 'mixed'
  const borderIcon = faceMixed ? ICON.borderMixed : borderFaceIcon(sides, bs, bw)
  const borderTitle = borderState === 'on' ? tr('designer.toolbar.borderToggleOn') : (faceMixed ? tr('designer.toolbar.borderToggleMixed') : tr('designer.toolbar.borderToggleOff'))
  const tbMenu = (ui && ui.tbMenu) || ''
  const menuOpen = tbMenu === 'border' && hasSel
  const kind = tpl.printKind === 'label' ? 'label' : 'document'
  const summaryOn = kind !== 'label' && tpl.summaryEnabled !== false
  const paperLab = preset === 'custom' ? tr('designer.toolbar.customSize') : String(preset || 'A4')
  const kindLab = kind === 'label' ? tr('designer.toolbar.kindLabel') : tr('designer.toolbar.kindReport')
  const textColorMix = commonValue(selectedEls, (e) => (((e.style || {}).color) || '#000000'))
  const bgColorMix = commonValue(selectedEls, (e) => (((e.style || {}).backgroundColor) || '#ffffff'))
  const textColor = textColorMix.value || '#000000'
  const bgColor = bgColorMix.value || '#ffffff'
  const off = hasSel ? '' : ' disabled'
  const textAlign = (selectedEls[0] && selectedEls[0].textAlign) || 'center'
  const vAlign = (selectedEls[0] && selectedEls[0].verticalAlign) || 'top'
  const bold = st.fontWeight === 'bold' || st.fontWeight === '700'
  const italic = st.fontStyle === 'italic'
  const under = st.textDecoration === 'underline'
  const strike = st.textDecoration === 'line-through'
  const dis = hasSel ? '' : ' disabled'
  let html = ''
  html += '<div class="tb-seg paper-controls">'
  html += '<div class="tb-drop' + (tbMenu === 'kind' ? ' is-open' : '') + '" data-drop="kind">'
  html += '<button type="button" class="tb-drop__btn" data-act="menu-kind" title="' + esc(tr('designer.toolbar.kind')) + '"><span>' + esc(kindLab) + '</span>' + dropCaret() + '</button>'
  html += '<div class="tb-drop__panel">'
  html += dropItem('kind', 'document', tr('designer.toolbar.kindReport'), kind !== 'label')
  html += dropItem('kind', 'label', tr('designer.toolbar.kindLabel'), kind === 'label')
  html += '</div></div>'
  html += '<div class="tb-drop' + (tbMenu === 'paper' ? ' is-open' : '') + '" data-drop="paper">'
  html += '<button type="button" class="tb-drop__btn" data-act="menu-paper" title="' + esc(tr('designer.toolbar.paper')) + '"><span>' + esc(paperLab) + '</span>' + dropCaret() + '</button>'
  html += '<div class="tb-drop__panel">'
  html += dropItem('preset', 'A4', 'A4', preset === 'A4')
  html += dropItem('preset', 'A5', 'A5', preset === 'A5')
  html += dropItem('preset', 'B5', 'B5', preset === 'B5')
  html += dropItem('preset', 'custom', tr('designer.toolbar.customSize'), preset === 'custom')
  html += '</div></div>'
  if (preset === 'custom') {
    html += '<div class="custom-size-inputs">'
    html += '<input type="number" data-act="mmw" step="0.1" min="0.1" value="' + esc(mmw) + '" placeholder="' + esc(tr('designer.toolbar.widthMm')) + '">'
    html += '<span class="times">×</span>'
    html += '<input type="number" data-act="mmh" step="0.1" min="0.1" value="' + esc(mmh) + '" placeholder="' + esc(tr('designer.toolbar.heightMm')) + '">'
    html += '<span class="unit">mm</span>'
    html += '</div>'
  }
  html += '<button type="button" class="tb-btn tb-btn--solo" data-act="orient" title="' + esc(orient === 'landscape' ? tr('designer.toolbar.landscape') : tr('designer.toolbar.portrait')) + '">' + (orient === 'landscape' ? ICON.landscape : ICON.portrait) + '</button>'
  if (kind !== 'label') {
    html += '<label class="summary-toggle"><input type="checkbox" data-act="summary"' + (summaryOn ? ' checked' : '') + '> ' + esc(tr('designer.toolbar.summaryEnabled')) + '</label>'
  }
  html += '</div>'
  html += '<div class="tb-seg tb-group alignment-buttons">'
  html += '<button type="button" class="tb-btn" data-act="alignx" title="' + esc(tr('designer.toolbar.alignXTitle')) + '">' + ICON.alignX + '</button>'
  html += '<button type="button" class="tb-btn" data-act="aligny" title="' + esc(tr('designer.toolbar.alignYTitle')) + '">' + ICON.alignY + '</button>'
  html += '<button type="button" class="tb-btn" data-act="syncw" title="' + esc(tr('designer.toolbar.syncColWidthTitle')) + '">' + ICON.syncW + '</button>'
  html += '<button type="button" class="tb-btn tb-btn--text" data-act="merge" title="' + esc(tr('designer.toolbar.mergeTitle')) + '"' + (canMerge ? '' : ' disabled') + '>' + esc(tr('designer.toolbar.merge')) + '</button>'
  html += '<button type="button" class="tb-btn" data-act="centerh" title="' + esc(tr('designer.toolbar.centerHTitle')) + '">' + ICON.centerH + '</button>'
  html += '<button type="button" class="tb-btn" data-act="centerv" title="' + esc(tr('designer.toolbar.centerVTitle')) + '">' + ICON.centerV + '</button>'
  html += '<button type="button" class="tb-btn" data-act="space" title="' + esc(tr('designer.toolbar.distributeTitle')) + '">' + ICON.space + '</button>'
  html += '</div>'
  html += '<div class="tb-seg border-menu' + (hasSel ? '' : ' is-off') + '">'
  html += '<div class="tb-drop tb-drop--split' + (menuOpen ? ' is-open' : '') + '" data-drop="border">'
  html += '<div class="tb-drop__split">'
  html += '<button type="button" class="tb-drop__icon is-' + (faceMixed ? 'mixed' : borderState) + '" data-act="border-toggle" title="' + esc(borderTitle) + '"' + off + '>'
  html += borderIcon
  html += '</button>'
  html += '<button type="button" class="tb-drop__caret-btn" data-act="menu-border" title="' + esc(tr('designer.toolbar.borderMoreTitle')) + '"' + off + '>' + dropCaret() + '</button>'
  html += '</div>'
  html += '<div class="tb-drop__panel tb-drop__panel--border">'
  html += '<input type="hidden" data-act="bw" value="' + esc(bw) + '">'
  html += '<input type="hidden" data-act="bs" value="' + esc(bs) + '">'
  html += '<button type="button" class="tb-drop__item' + (sides.bottom ? ' is-on' : '') + '" data-act="border-bottom">' + ICON.borderBottom + '<span>' + esc(tr('designer.toolbar.borderBottom')) + '</span></button>'
  html += '<button type="button" class="tb-drop__item' + (sides.top ? ' is-on' : '') + '" data-act="border-top">' + ICON.borderTop + '<span>' + esc(tr('designer.toolbar.borderTop')) + '</span></button>'
  html += '<button type="button" class="tb-drop__item' + (sides.left ? ' is-on' : '') + '" data-act="border-left">' + ICON.borderLeft + '<span>' + esc(tr('designer.toolbar.borderLeft')) + '</span></button>'
  html += '<button type="button" class="tb-drop__item' + (sides.right ? ' is-on' : '') + '" data-act="border-right">' + ICON.borderRight + '<span>' + esc(tr('designer.toolbar.borderRight')) + '</span></button>'
  html += '<button type="button" class="tb-drop__item' + (noneOn ? ' is-on' : '') + '" data-act="border-none">' + ICON.borderNone + '<span>' + esc(tr('designer.toolbar.borderNone')) + '</span></button>'
  html += '<button type="button" class="tb-drop__item' + (allOn ? ' is-on' : '') + '" data-act="border-all">' + ICON.borderAll + '<span>' + esc(tr('designer.toolbar.borderAll')) + '</span></button>'
  html += '<div class="tb-drop__hr"></div>'
  html += '<div class="tb-drop__lab">' + esc(tr('designer.toolbar.borderLineStyle')) + '</div>'
  html += '<div class="tb-drop__row">'
  html += [1, 2, 3, 4, 5].map((n) => '<button type="button" class="border-chip' + (Number(bw) === n ? ' on' : '') + '" data-act="bw-pick" data-val="' + n + '">' + n + '</button>').join('')
  html += '</div>'
  html += '<div class="tb-drop__row">'
  html += ['solid', 'dashed', 'dotted'].map((stName) => '<button type="button" class="border-chip border-chip--style' + (bs === stName ? ' on' : '') + '" data-act="bs-pick" data-val="' + stName + '"><span class="border-chip__line" style="border-bottom:2px ' + stName + ' currentColor"></span></button>').join('')
  html += '</div>'
  html += '<div class="tb-drop__lab">' + esc(tr('designer.toolbar.borderLineColor')) + '</div>'
  html += '<div class="tb-drop__row"><input type="color" class="tb-drop__color" data-act="bc" value="' + esc(bc) + '"' + off + '></div>'
  html += '</div></div></div>'
  html += '<div class="tb-seg text-style-controls' + (hasSel ? '' : ' is-off') + '">'
  html += '<select data-act="fontFamily" title="' + esc(tr('designer.toolbar.fontFamilySelect')) + '"' + dis + '>' + fontOpts + '</select>'
  html += '<select data-act="fontSize" title="' + esc(tr('designer.toolbar.fontSizeTitle')) + '"' + dis + '>' + FONT_SIZES.map((n) => '<option value="' + n + '"' + (n === fsNum ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>'
  html += '<div class="tb-group">'
  html += '<button type="button" class="tb-btn' + (bold ? ' active' : '') + '" data-act="bold" title="' + esc(tr('designer.toolbar.boldTitle')) + '"' + dis + '><b>B</b></button>'
  html += '<button type="button" class="tb-btn' + (italic ? ' active' : '') + '" data-act="italic" title="' + esc(tr('designer.toolbar.italicTitle')) + '"' + dis + '><i>I</i></button>'
  html += '<button type="button" class="tb-btn' + (under ? ' active' : '') + '" data-act="under" title="' + esc(tr('designer.toolbar.underlineTitle')) + '"' + dis + '><u>U</u></button>'
  html += '<button type="button" class="tb-btn' + (strike ? ' active' : '') + '" data-act="strike" title="' + esc(tr('designer.toolbar.strikethroughTitle')) + '"' + dis + '><s>S</s></button>'
  html += '<label class="tb-color" title="' + esc(tr('designer.toolbar.textColorTitle')) + '">'
  html += '<span class="tb-color__mark' + (textColorMix.mixed ? ' is-mixed' : '') + '" style="color:' + esc(textColorMix.mixed ? '#6b7280' : textColor) + '">A</span>'
  html += '<input type="color" class="tb-color__native" data-act="color" value="' + esc(st.color || '#000000') + '"' + dis + '>'
  html += '</label>'
  html += '<label class="tb-color" title="' + esc(tr('designer.toolbar.bgColorTitle')) + '">'
  html += '<span class="tb-color__mark tb-color__mark--fill">' + fillFaceIcon(bgColor, bgColorMix.mixed) + '</span>'
  html += '<input type="color" class="tb-color__native" data-act="bg" value="' + esc(st.backgroundColor || '#ffffff') + '"' + dis + '>'
  html += '</label>'
  html += '</div>'
  html += '<div class="tb-group">'
  html += '<button type="button" class="tb-btn" data-act="talign" title="' + alignTitle(textAlign) + '"' + dis + '>' + alignIcon(textAlign) + '</button>'
  html += '<button type="button" class="tb-btn" data-act="valign" title="' + valignTitle(vAlign) + '"' + dis + '>' + valignIcon(vAlign) + '</button>'
  html += '</div></div>'
  html += '<div class="tb-seg tb-drop' + (tbMenu === 'print' ? ' is-open' : '') + '" data-drop="print">'
  html += '<button type="button" class="tb-drop__btn" data-act="menu-print"><span>' + esc(tr('designer.toolbar.printMenu')) + '</span>' + dropCaret() + '</button>'
  html += '<div class="tb-drop__panel">'
  html += '<button type="button" class="tb-drop__item" data-act="frontend-print"><span class="tb-drop__check"></span><span>' + esc(tr('designer.toolbar.frontendPrintBtn')) + '</span></button>'
  html += '<button type="button" class="tb-drop__item" data-act="pdf-print"><span class="tb-drop__check"></span><span>' + esc(tr('designer.toolbar.pdfPrintBtn')) + '</span></button>'
  html += '<button type="button" class="tb-drop__item" data-act="frontend-jump"><span class="tb-drop__check"></span><span>' + esc(tr('designer.toolbar.frontendJumpBtn')) + '</span></button>'
  html += '<button type="button" class="tb-drop__item" data-act="pdf-jump"><span class="tb-drop__check"></span><span>' + esc(tr('designer.toolbar.pdfJumpBtn')) + '</span></button>'
  html += '</div></div>'
  return html
}

export function readBorderDraft (bar) {
  const w = bar.querySelector('[data-act=bw]')
  const s = bar.querySelector('[data-act=bs]')
  const c = bar.querySelector('[data-act=bc]')
  return {
    width: w ? Number(w.value) : 1,
    style: s ? s.value : 'solid',
    color: c ? c.value : '#000000'
  }
}
