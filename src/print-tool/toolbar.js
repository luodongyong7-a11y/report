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
  space: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 4h2v1H1zm4 0h2v1H5zm4 0h2v1H9zm4 0h2v1h-2zM1 8h2v1H1zm4 0h2v1H5zm4 0h2v1H9zm4 0h2v1h-2zM1 12h2v1H1zm4 0h2v1H5zm4 0h2v1H9zm4 0h2v1h-2z"/></svg>'
}

function esc (s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
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
  const bw = (selectedEls[0] && selectedEls[0].border && selectedEls[0].border.width) || 1
  const bs = (selectedEls[0] && selectedEls[0].border && selectedEls[0].border.style) || 'solid'
  const bc = (selectedEls[0] && selectedEls[0].border && selectedEls[0].border.color) || '#000000'
  const textAlign = (selectedEls[0] && selectedEls[0].textAlign) || 'center'
  const vAlign = (selectedEls[0] && selectedEls[0].verticalAlign) || 'top'
  const bold = st.fontWeight === 'bold' || st.fontWeight === '700'
  const italic = st.fontStyle === 'italic'
  const under = st.textDecoration === 'underline'
  const strike = st.textDecoration === 'line-through'
  const dis = hasSel ? '' : ' disabled'
  let html = ''
  html += '<div class="paper-controls"><div class="paper-size-selector">'
  html += '<label for="paperSize">' + esc(tr('designer.toolbar.paper')) + '</label>'
  html += '<select data-act="preset" id="paperSize">'
  html += '<option value="A4"' + (preset === 'A4' ? ' selected' : '') + '>A4</option>'
  html += '<option value="A5"' + (preset === 'A5' ? ' selected' : '') + '>A5</option>'
  html += '<option value="B5"' + (preset === 'B5' ? ' selected' : '') + '>B5</option>'
  html += '<option value="custom"' + (preset === 'custom' ? ' selected' : '') + '>' + esc(tr('designer.toolbar.customSize')) + '</option>'
  html += '</select>'
  if (preset === 'custom') {
    html += '<div class="custom-size-inputs">'
    html += '<input type="number" data-act="mmw" step="0.1" min="0" value="' + esc(mmw) + '" placeholder="' + esc(tr('designer.toolbar.widthMm')) + '">'
    html += '<span class="unit">mm</span>'
    html += '<span class="times">×</span>'
    html += '<input type="number" data-act="mmh" step="0.1" min="0" value="' + esc(mmh) + '" placeholder="' + esc(tr('designer.toolbar.heightMm')) + '">'
    html += '<span class="unit">mm</span>'
    html += '</div>'
  }
  html += '</div>'
  html += '<div class="orientation-selector">'
  html += '<label><input type="radio" name="npt-orient" data-act="orient" value="portrait"' + (orient !== 'landscape' ? ' checked' : '') + '> ' + esc(tr('designer.toolbar.portrait')) + '</label>'
  html += '<label><input type="radio" name="npt-orient" data-act="orient" value="landscape"' + (orient === 'landscape' ? ' checked' : '') + '> ' + esc(tr('designer.toolbar.landscape')) + '</label>'
  html += '</div></div>'
  html += '<div class="alignment-buttons tb-group">'
  html += '<button type="button" class="tb-btn" data-act="alignx" title="' + esc(tr('designer.toolbar.alignXTitle')) + '">' + ICON.alignX + '</button>'
  html += '<button type="button" class="tb-btn" data-act="aligny" title="' + esc(tr('designer.toolbar.alignYTitle')) + '">' + ICON.alignY + '</button>'
  html += '<button type="button" class="tb-btn" data-act="syncw" title="' + esc(tr('designer.toolbar.syncColWidthTitle')) + '">' + ICON.syncW + '</button>'
  html += '<button type="button" class="tb-btn tb-btn--text" data-act="merge" title="' + esc(tr('designer.toolbar.mergeTitle')) + '"' + (canMerge ? '' : ' disabled') + '>' + esc(tr('designer.toolbar.merge')) + '</button>'
  html += '<button type="button" class="tb-btn" data-act="centerh" title="' + esc(tr('designer.toolbar.centerHTitle')) + '">' + ICON.centerH + '</button>'
  html += '<button type="button" class="tb-btn" data-act="centerv" title="' + esc(tr('designer.toolbar.centerVTitle')) + '">' + ICON.centerV + '</button>'
  html += '<button type="button" class="tb-btn" data-act="space" title="' + esc(tr('designer.toolbar.distributeTitle')) + '">' + ICON.space + '</button>'
  html += '</div>'
  html += '<div class="border-controls">'
  html += '<div class="control-group"><select data-act="bw" title="' + esc(tr('designer.toolbar.borderWidthTitle')) + '">' + [1, 2, 3, 4, 5].map((n) => '<option value="' + n + '"' + (Number(bw) === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>'
  html += '<div class="control-group"><select data-act="bs" title="' + esc(tr('designer.toolbar.borderStyleTitle')) + '"><option value="solid"' + (bs === 'solid' ? ' selected' : '') + '>────</option><option value="dashed"' + (bs === 'dashed' ? ' selected' : '') + '>--------</option><option value="dotted"' + (bs === 'dotted' ? ' selected' : '') + '>····</option></select></div>'
  html += '<div class="control-group"><input type="color" data-act="bc" value="' + esc(bc) + '" title="' + esc(tr('designer.toolbar.borderColorTitle')) + '"></div>'
  html += '<div class="control-group tb-group"><button type="button" class="tb-btn" data-act="border" title="' + esc(tr('designer.toolbar.toggleBorderTitle')) + '">▢</button></div>'
  html += '</div>'
  html += '<div class="text-style-controls">'
  html += '<div class="control-group"><input type="color" data-act="color" value="' + esc(st.color || '#000000') + '" title="' + esc(tr('designer.toolbar.textColorTitle')) + '"' + dis + '></div>'
  html += '<div class="control-group"><input type="color" data-act="bg" value="' + esc(st.backgroundColor || '#ffffff') + '" title="' + esc(tr('designer.toolbar.bgColorTitle')) + '"' + dis + '></div>'
  html += '<div class="control-group"><select data-act="fontFamily" title="' + esc(tr('designer.toolbar.fontFamilySelect')) + '"' + dis + '>' + fontOpts + '</select></div>'
  html += '<div class="control-group"><select data-act="fontSize" title="' + esc(tr('designer.toolbar.fontSizeTitle')) + '"' + dis + '>' + FONT_SIZES.map((n) => '<option value="' + n + '"' + (n === fsNum ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>'
  html += '<div class="control-group tb-group">'
  html += '<button type="button" class="tb-btn' + (bold ? ' active' : '') + '" data-act="bold" title="' + esc(tr('designer.toolbar.boldTitle')) + '"' + dis + '><b>B</b></button>'
  html += '<button type="button" class="tb-btn' + (italic ? ' active' : '') + '" data-act="italic" title="' + esc(tr('designer.toolbar.italicTitle')) + '"' + dis + '><i>I</i></button>'
  html += '<button type="button" class="tb-btn' + (under ? ' active' : '') + '" data-act="under" title="' + esc(tr('designer.toolbar.underlineTitle')) + '"' + dis + '><u>U</u></button>'
  html += '<button type="button" class="tb-btn' + (strike ? ' active' : '') + '" data-act="strike" title="' + esc(tr('designer.toolbar.strikethroughTitle')) + '"' + dis + '><s>S</s></button>'
  html += '</div>'
  html += '<div class="control-group tb-group">'
  html += '<button type="button" class="tb-btn" data-act="talign" title="' + alignTitle(textAlign) + '"' + dis + '>' + alignIcon(textAlign) + '</button>'
  html += '<button type="button" class="tb-btn" data-act="valign" title="' + valignTitle(vAlign) + '"' + dis + '>' + valignIcon(vAlign) + '</button>'
  html += '</div></div>'
  html += '<div class="view-toggle">'
  html += '<button class="tb-action" type="button" data-act="frontend-print" title="' + esc(tr('designer.toolbar.frontendPrintBtn')) + '">' + esc(tr('designer.toolbar.frontendPrintBtn')) + '</button>'
  html += '<button class="tb-action tb-action--primary" type="button" data-act="pdf-print" title="' + esc(tr('designer.toolbar.pdfPrintBtn')) + '">' + esc(tr('designer.toolbar.pdfPrintBtn')) + '</button>'
  html += '<button class="tb-action" type="button" data-act="frontend-jump" title="' + esc(tr('designer.toolbar.frontendJumpBtn')) + '">' + esc(tr('designer.toolbar.frontendJumpBtn')) + '</button>'
  html += '<button class="tb-action" type="button" data-act="pdf-jump" title="' + esc(tr('designer.toolbar.pdfJumpBtn')) + '">' + esc(tr('designer.toolbar.pdfJumpBtn')) + '</button>'
  html += '</div>'
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
