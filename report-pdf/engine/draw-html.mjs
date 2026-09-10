// 预览专用 HTML 绘制:与 draw.mjs 消费同一套 placed 绝对坐标页。
// 产出完整 HTML 文档(内嵌 @font-face + 页盒),前端只挂载展示,不再本地 expand/paginate。
import './fonts.mjs'
import { createHash } from 'node:crypto'
import { FONT_BUFFERS, FONT_FAMILY, FONT_PATHS } from './fonts.mjs'
import { fontKeyForFamily, REPORT_MEDIA_PADDING_PX } from './font-policy.mjs'
import {
  measureCell,
  REPORT_TEXT_PADDING_PX,
  resolveFontWeight,
  resolveFontStyle,
  resolveBorderWidth,
  resolveFontSizePx
} from './measure.mjs'
import { splitRuns } from './metrics.mjs'
import {
  generateMediaBuffer,
  imageDimensions,
  previewBarcodeCanvasSize,
  previewQrCanvasSize
} from './media.mjs'
import { computeCollapsedBorders } from './border-collapse.mjs'

const CSS_FONT = {
  times: FONT_FAMILY.times,
  song: FONT_FAMILY.song,
  hei: FONT_FAMILY.hei,
  symbol: FONT_FAMILY.symbol
}

const FACE_CSS = [
  { key: 'times', family: FONT_FAMILY.times, weight: '400', style: 'normal' },
  { key: 'timesBd', family: FONT_FAMILY.times, weight: '700', style: 'normal' },
  { key: 'timesIt', family: FONT_FAMILY.times, weight: '400', style: 'italic' },
  { key: 'timesBi', family: FONT_FAMILY.times, weight: '700', style: 'italic' },
  { key: 'simsun', family: FONT_FAMILY.song, weight: '400', style: 'normal' },
  { key: 'simhei', family: FONT_FAMILY.hei, weight: '400', style: 'normal' },
  { key: 'segoesym', family: FONT_FAMILY.symbol, weight: '400', style: 'normal' }
]

function escapeHtml (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr (s) {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

function fontMimeAndFormat (filePath) {
  const p = String(filePath || '').toLowerCase()
  if (p.endsWith('.woff2')) return { mime: 'font/woff2', format: 'woff2' }
  if (p.endsWith('.woff')) return { mime: 'font/woff', format: 'woff' }
  if (p.endsWith('.otf')) return { mime: 'font/otf', format: 'opentype' }
  if (p.endsWith('.ttc')) return { mime: 'font/collection', format: 'collection' }
  return { mime: 'font/ttf', format: 'truetype' }
}

// HTML 预览字体策略(要「跨环境一致」又要「别每份 HTML 塞 5MB+」):
//   link  (默认): @font-face 外链 /report/fonts/{key},浏览器强缓存,与 PDF 同文件
//   local: 仅 local(),依赖客户端系统字体(小,但不保证一致)
//   embed: data URL 内联(可用 REPORT_HTML_FONT_EMBED_MAX 限制单面大小)
// 超大字库(如 simsun.ttc ~18MB)默认不外链,仍 local();可用 REPORT_HTML_FONT_LINK_MAX 覆盖。
const FONT_MODE = String(process.env.REPORT_HTML_FONT_MODE || 'link').toLowerCase()
const FONT_BASE = String(process.env.REPORT_HTML_FONT_BASE || '/report/fonts').replace(/\/$/, '')
const FONT_EMBED_MAX = Number(process.env.REPORT_HTML_FONT_EMBED_MAX || 1500000)
const FONT_LINK_MAX = Number(process.env.REPORT_HTML_FONT_LINK_MAX || 3 * 1024 * 1024)

function buildFontFaceCss () {
  const blocks = []
  for (const face of FACE_CSS) {
    const buf = FONT_BUFFERS[face.key]
    const path = FONT_PATHS[face.key]
    const localSrc = `local('${face.family}')`
    const { format } = fontMimeAndFormat(path)
    let src = localSrc

    if (FONT_MODE === 'embed') {
      if (buf && buf.length && buf.length <= FONT_EMBED_MAX) {
        const { mime } = fontMimeAndFormat(path)
        src = `url(data:${mime};base64,${buf.toString('base64')}) format('${format}'),${localSrc}`
      }
    } else if (FONT_MODE === 'local') {
      src = localSrc
    } else {
      // link: URL 优先,保证与边车 PDF 度量字体同源;系统 local 仅作回退。
      const linkable = buf && buf.length && buf.length <= FONT_LINK_MAX && !String(path || '').toLowerCase().endsWith('.ttc')
      if (linkable) {
        src = `url('${FONT_BASE}/${face.key}') format('${format}'),${localSrc}`
      }
    }

    blocks.push(
      `@font-face{font-family:'${face.family}';font-weight:${face.weight};font-style:${face.style};` +
      `src:${src};font-display:block;}`
    )
  }
  return blocks.join('')
}

// 单元格只占「边框空间」(透明 border 保持 border-box 内容盒不变),真实边框由 border-collapse 在页级统一绘制,
// 避免相邻格各画一圈导致共享边双线。
function cellBorderSpaceCss (placed) {
  const border = resolveBorderWidth(placed)
  if (border <= 0) return 'border:none;'
  return `border:${border}px solid transparent;box-sizing:border-box;`
}

// 一条已合并的边框线段 → 绝对定位细 div(border-left/top 支持实线/虚线/点线)。
function borderSegDiv (seg) {
  const { orient, left, top, len, bw, color, style } = seg
  const base = `position:absolute;left:${left}px;top:${top}px;`
  if (orient === 'v') {
    return `<div class="report-cell__border" style="${base}height:${len}px;border-left:${bw}px ${style} ${escapeAttr(color)};"></div>`
  }
  return `<div class="report-cell__border" style="${base}width:${len}px;border-top:${bw}px ${style} ${escapeAttr(color)};"></div>`
}

function cellBgCss (placed, fallback) {
  let bg = placed.fill || (placed.style && placed.style.backgroundColor) || fallback
  if (bg && typeof bg === 'string' && !bg.includes('gradient')) {
    return `background:${escapeAttr(bg)};`
  }
  return fallback ? `background:${escapeAttr(fallback)};` : 'background:transparent;'
}

function fontStack (primaryKey) {
  const primary = CSS_FONT[primaryKey] || FONT_FAMILY.times
  return `'${primary}','${FONT_FAMILY.song}','${FONT_FAMILY.times}','${FONT_FAMILY.symbol}'`
}

function mediaNaturalSize (placed, buffer, innerWPx, innerHPx) {
  if (placed.type === 'qrcode') {
    const s = previewQrCanvasSize(placed)
    return { w: s, h: s }
  }
  if (placed.type === 'barcode') {
    const { containerW, containerH } = previewBarcodeCanvasSize(placed)
    return { w: containerW, h: containerH }
  }
  const dim = buffer ? imageDimensions(buffer) : null
  if (dim) return { w: Math.max(1, dim.width), h: Math.max(1, dim.height) }
  return { w: innerWPx, h: innerHPx }
}

function renderTextCell (placed) {
  // 与 draw.mjs drawTextCell 同口径:measureCell(autoGrow:false) 得缩字/换行后,
  // 按 lines[].top/width 绝对定位,禁止浏览器二次换行(避免 HTML 再撑破固定格)。
  const m = measureCell(placed, { autoGrow: false })
  const { fontSizePx, pad, border, lines, contentHeight } = m
  const align = placed.textAlign || 'center'
  const va = placed.verticalAlign || 'top'
  const primaryFontKey = fontKeyForFamily(placed.style && placed.style.fontFamily)
  const bold = resolveFontWeight(placed)
  const italic = resolveFontStyle(placed)
  const color = (placed.style && placed.style.color) || '#000'
  const deco = (placed.style && placed.style.textDecoration) || 'none'
  const textDecoration = deco === 'underline' || deco === 'line-through' ? deco : 'none'
  const fs = fontSizePx || resolveFontSizePx(placed)

  const availHeightPx = placed.height - 2 * pad - 2 * border
  const contentW = Math.max(0, placed.width - 2 * pad - 2 * border)
  // napi 行高略高于浏览器 CSS normal 时,三行会比设计器多出 ~1px 导致底裁。
  // 仅垂直方向压缩到 availHeight(不改字号/换行),与设计器「第三行仍可见」对齐;PDF 走矢量裁切观感不同故不在此处理。
  const scaleY = (contentHeight > availHeightPx && availHeightPx > 0)
    ? (availHeightPx / contentHeight)
    : 1
  const drawnH = contentHeight * scaleY
  let vOffset = 0
  if (va === 'center') vOffset = Math.max(0, (availHeightPx - drawnH) / 2)
  else if (va === 'bottom') vOffset = Math.max(0, availHeightPx - drawnH)

  const lineHtml = lines.map(ln => {
    let left = 0
    if (align === 'right') left = Math.max(0, contentW - ln.width)
    else if (align === 'center') left = Math.max(0, (contentW - ln.width) / 2)
    const top = vOffset + ln.top * scaleY
    const lineH = Math.max(1, ln.height * scaleY)
    // 与 PDF drawLineRuns 同口径:按字形覆盖切 run,每段显式字体,避免整行只挂主字体栈导致中西文回退与设计器/PDF 漂移。
    const runsHtml = splitRuns(ln.text, primaryFontKey).map(run => {
      const runStyle = [
        `font-family:${fontStack(run.fontKey)}`,
        `font-size:${fs}px`,
        `font-weight:${bold ? '700' : '400'}`,
        `font-style:${italic ? 'italic' : 'normal'}`,
        `color:${escapeAttr(color)}`,
        `text-decoration:${textDecoration}`
      ].join(';')
      return `<span style="${runStyle}">${escapeHtml(run.text)}</span>`
    }).join('')
    // 行盒不设 overflow:hidden:避免浏览器字形高于 napi 行高时被行内裁掉(PDF 无此行级裁剪)。
    const lnStyle = [
      'position:absolute',
      `left:${left}px`,
      `top:${top}px`,
      `width:${Math.max(1, ln.width)}px`,
      `height:${lineH}px`,
      `line-height:${lineH}px`,
      'white-space:pre',
      'box-sizing:border-box'
    ].join(';')
    return `<div class="report-cell__line" style="${lnStyle}">${runsHtml}</div>`
  }).join('')

  const style = [
    `left:${placed.x}px`,
    `top:${placed.y}px`,
    `width:${placed.width}px`,
    `height:${placed.height}px`,
    cellBorderSpaceCss(placed),
    cellBgCss(placed, null),
    `padding:${pad}px`,
    'position:absolute',
    'overflow:hidden',
    'box-sizing:border-box'
  ].join(';')

  const innerStyle = [
    'position:relative',
    'width:100%',
    'height:100%',
    'overflow:hidden',
    'margin:0',
    'padding:0'
  ].join(';')

  return `<div class="report-cell report-cell--text" style="${style}"><div class="report-cell__text" style="${innerStyle}">${lineHtml}</div></div>`
}

function renderMediaCell (placed, mediaRegistry) {
  const pad = REPORT_MEDIA_PADDING_PX
  const border = resolveBorderWidth(placed)
  const xPx = placed.x
  const yPx = placed.y
  const wPx = placed.width
  const hPx = placed.height
  const fallbackBg = placed.type === 'image' ? null : '#f8f9fa'

  const style = [
    `left:${xPx}px`,
    `top:${yPx}px`,
    `width:${wPx}px`,
    `height:${hPx}px`,
    cellBorderSpaceCss(placed),
    cellBgCss(placed, fallbackBg),
    `padding:${pad}px`,
    'position:absolute',
    'overflow:hidden',
    'box-sizing:border-box',
    'display:flex',
    'align-items:center',
    'justify-content:center'
  ].join(';')

  const innerWPx = wPx - 2 * border - 2 * pad
  const innerHPx = hPx - 2 * border - 2 * pad
  let inner = ''
  if (placed.__img && innerWPx > 0 && innerHPx > 0) {
    const nat = mediaNaturalSize(placed, placed.__img, innerWPx, innerHPx)
    const scale = Math.min(innerWPx / nat.w, innerHPx / nat.h)
    const dispW = Math.max(1, nat.w * scale)
    const dispH = Math.max(1, nat.h * scale)
    // 相同位图只在 CSS 写一次 data URL,单元格用 class 引用,避免页眉 Logo 等跨页重复膨胀。
    const cls = mediaRegistry.register(placed.__img)
    inner = `<span class="report-cell__media ${cls}" style="width:${dispW}px;height:${dispH}px;"></span>`
  } else {
    inner = `<span class="report-cell__placeholder" style="font-size:9px;color:#666;font-family:${fontStack('times')}">[${escapeHtml(placed.type)}]</span>`
  }

  return `<div class="report-cell report-cell--media" style="${style}">${inner}</div>`
}

function renderElement (placed, mediaRegistry) {
  if (placed.type === 'text' || placed.type === 'data') return renderTextCell(placed)
  return renderMediaCell(placed, mediaRegistry)
}

function mediaFingerprint (placed) {
  const content = placed.parsedContent
  if (content == null || content === '') return ''
  return `${placed.type}|${placed.width}|${placed.height}|${String(content)}|${(placed.style && placed.style.color) || ''}`
}

function bufferDataUrl (buf) {
  if (!buf || !buf.length) return ''
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return `data:image/gif;base64,${buf.toString('base64')}`
  }
  return `data:image/png;base64,${buf.toString('base64')}`
}

function createMediaRegistry () {
  const byHash = new Map()
  let seq = 0
  return {
    register (buf) {
      if (!buf || !buf.length) return ''
      const hash = createHash('sha1').update(buf).digest('hex')
      let entry = byHash.get(hash)
      if (!entry) {
        entry = { className: `rm-${++seq}`, url: bufferDataUrl(buf) }
        byHash.set(hash, entry)
      }
      return entry.className
    },
    css () {
      let out = ''
      for (const { className, url } of byHash.values()) {
        out += `.report-html-root .${className}{background-image:url(${url});` +
          `background-repeat:no-repeat;background-position:center;background-size:100% 100%;display:block;}`
      }
      return out
    }
  }
}

function documentShell (bodyInner, paperSize, extraCss = '') {
  const fontCss = buildFontFaceCss()
  const pageW = Number(paperSize && paperSize.width) || 794
  const pageH = Number(paperSize && paperSize.height) || 1123
  const wMm = (pageW * 25.4 / 96).toFixed(3)
  const hMm = (pageH * 25.4 / 96).toFixed(3)
  const wmSize = Math.max(16, Math.min(22, Math.round(Math.min(pageW, pageH) * 0.026)))
  const wmBox = Math.max(56, Math.round((wmSize * 4 + wmSize) * Math.SQRT1_2))
  const wmCrop = Math.max(4, Math.round(wmSize * 0.35))
  // 样式全部挂在 .report-html-root 下,前端挂入主文档时不会污染宿主 html/body。
  const css =
    fontCss +
    `.report-html-root,.report-html-root *{box-sizing:border-box;}` +
    `.report-html-root{display:flex;flex-direction:column;align-items:center;padding:0;margin:0;background:transparent;}` +
    `.report-html-root .report-page{position:relative;background:#fff;overflow:hidden;` +
    `width:${pageW}px;height:${pageH}px;margin:15px 0 0 0;` +
    `box-shadow:0 1px 3px rgba(0,0,0,.12);}` +
    `.report-html-root .report-page:first-child{margin-top:0;}` +
    `.report-html-root .report-watermark{position:absolute;top:-${wmCrop}px;right:-${wmCrop}px;width:${wmBox}px;height:${wmBox}px;` +
    `display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:8;}` +
    `.report-html-root .report-watermark span{display:inline-block;font-size:${wmSize}px;font-weight:600;color:rgba(0,0,0,.28);` +
    `white-space:nowrap;user-select:none;transform:rotate(45deg);}` +
    `@page{size:${wMm}mm ${hMm}mm;margin:0}` +
    `@media print{html,body{margin:0;padding:0;background:#fff}` +
    `.report-html-root{padding:0;background:#fff}` +
    `.report-html-root .report-page{margin:0!important;box-shadow:none!important;page-break-after:always;break-after:page}` +
    `.report-html-root .report-page:last-child{page-break-after:auto;break-after:auto}` +
    `.report-html-root .report-watermark span{color:rgba(0,0,0,.28);-webkit-print-color-adjust:exact;print-color-adjust:exact;}}` +
    (extraCss || '')

  return '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    `<style>${css}</style></head>` +
    `<body><div class="report-html-root">${bodyInner}</div></body></html>`
}

/**
 * 把 pages 渲染成预览 HTML Buffer。
 * @param {{ pages: Array, paperSize: {width:number,height:number} }} args
 * @returns {Promise<Buffer>}
 */
const WATERMARK_HTML = '<div class="report-watermark" aria-hidden="true"><span>免费版</span></div>'

export async function buildHtmlBuffer ({ pages, paperSize, watermark }) {
  const mediaByKey = new Map()
  for (const page of pages) {
    for (const placed of page.elements) {
      if (placed.type === 'qrcode' || placed.type === 'barcode' || placed.type === 'image') {
        const key = mediaFingerprint(placed)
        if (key && mediaByKey.has(key)) {
          placed.__img = mediaByKey.get(key)
        } else {
          placed.__img = await generateMediaBuffer(placed)
          if (key && placed.__img) mediaByKey.set(key, placed.__img)
        }
      }
    }
  }

  const mediaRegistry = createMediaRegistry()
  const pageHtml = pages.map(page => {
    const cells = page.elements.map((el) => renderElement(el, mediaRegistry)).join('')
    // 边框统一在页级绘制:相邻共享边已合并,避免每格各画一圈导致的双线。
    const borders = computeCollapsedBorders(page.elements)
    const borderCells = borders.map(segs => segs.map(borderSegDiv).join('')).join('')
    return `<div class="report-page">${cells}${borderCells}${watermark ? WATERMARK_HTML : ''}</div>`
  }).join('')

  const html = documentShell(
    pageHtml,
    paperSize || { width: 794, height: 1123 },
    mediaRegistry.css()
  )
  return Buffer.from(html, 'utf8')
}

export { REPORT_TEXT_PADDING_PX }
