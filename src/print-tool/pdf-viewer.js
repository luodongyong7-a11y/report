// 缩放 50%–300%，先 CSS scale 再 420ms 后清晰重绘；PDF_CSS_SCALE=96/72
import { PdfDocument, paintPage } from '@niqer/pdf'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_STEP = 0.05
const ZOOM_WHEEL_STEP = 0.03
const ZOOM_SETTLE_MS = 420
const RENDER_UPSCALE_THRESHOLD = 0.05
const RENDER_DOWNSCALE_THRESHOLD = 0.2
const ZOOM_DEFAULT = 1
const PDF_CSS_SCALE = 96 / 72

function clampZoom (v) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 1000) / 1000))
}

function pageRenderScale (zoom) {
  return PDF_CSS_SCALE * zoom
}

export function mountPdfViewer (container, opts = {}) {
  const doc = container.ownerDocument
  container.innerHTML = ''
  container.classList.add('report-pdf-shell')
  container.tabIndex = -1
  const zoombar = doc.createElement('div')
  zoombar.className = 'report-pdf-zoombar'
  zoombar.innerHTML =
    '<button type="button" class="report-pdf-zoombar__btn" data-z="out" disabled>−</button>' +
    '<span class="report-pdf-zoombar__label">100%</span>' +
    '<button type="button" class="report-pdf-zoombar__btn" data-z="in" disabled>+</button>'
  const pagesEl = doc.createElement('div')
  pagesEl.className = 'report-pdf-pages report-pdf-pages--empty'
  const scaler = doc.createElement('div')
  scaler.className = 'report-pdf-pages-scaler'
  const inner = doc.createElement('div')
  inner.className = 'report-pdf-pages-inner'
  scaler.appendChild(inner)
  pagesEl.appendChild(scaler)
  container.appendChild(zoombar)
  container.appendChild(pagesEl)

  const btnOut = zoombar.querySelector('[data-z=out]')
  const btnIn = zoombar.querySelector('[data-z=in]')
  const label = zoombar.querySelector('.report-pdf-zoombar__label')

  let pdfDoc = null
  let pdfPages = []
  let pageEls = []
  let renderGen = 0
  let zoomFactor = ZOOM_DEFAULT
  let renderedZoom = ZOOM_DEFAULT
  let cssScale = 1
  let contentHeight = 0
  let zoomSettleTimer = null

  function syncLabel () {
    label.textContent = Math.round(zoomFactor * 100) + '%'
    const hasPages = pdfPages.length > 0
    btnOut.disabled = !hasPages
    btnIn.disabled = !hasPages
  }

  function syncContentMetrics () {
    contentHeight = inner.scrollHeight || 0
    if (!contentHeight) {
      scaler.style.height = ''
      return
    }
    scaler.style.height = Math.max(1, contentHeight * cssScale) + 'px'
  }

  function applyInnerTransform () {
    if (Math.abs(cssScale - 1) < 0.001) {
      inner.style.transform = 'none'
    } else {
      inner.style.transform = 'scale(' + cssScale + ')'
      inner.style.transformOrigin = 'top center'
    }
    syncContentMetrics()
  }

  function syncCssScale () {
    if (!renderedZoom) {
      cssScale = 1
      applyInnerTransform()
      return
    }
    const next = zoomFactor / renderedZoom
    cssScale = Math.abs(next - 1) < 0.001 ? 1 : next
    applyInnerTransform()
  }

  function needsCrispRerender () {
    if (!renderedZoom) return true
    const ratio = zoomFactor / renderedZoom
    if (ratio > 1) return ratio - 1 >= RENDER_UPSCALE_THRESHOLD
    return 1 - ratio >= RENDER_DOWNSCALE_THRESHOLD
  }

  function setZoom (next) {
    if (!pdfDoc) return
    const value = clampZoom(next)
    if (value === zoomFactor) return
    zoomFactor = value
    syncLabel()
    syncCssScale()
    clearTimeout(zoomSettleTimer)
    zoomSettleTimer = setTimeout(() => {
      if (!pdfDoc) return
      if (!needsCrispRerender()) return
      const gen = ++renderGen
      renderAllPages(gen)
    }, ZOOM_SETTLE_MS)
  }

  function mountPageEls (total) {
    inner.innerHTML = ''
    pageEls = []
    for (let i = 0; i < total; i++) {
      const pageEl = doc.createElement('div')
      pageEl.className = 'report-pdf-page'
      const canvas = doc.createElement('canvas')
      canvas.className = 'report-pdf-page__canvas'
      pageEl.appendChild(canvas)
      inner.appendChild(pageEl)
      pageEls.push(pageEl)
    }
  }

  function clearPages () {
    pageEls = []
    inner.innerHTML = ''
    contentHeight = 0
    cssScale = 1
    inner.style.transform = 'none'
    scaler.style.height = ''
    pagesEl.classList.add('report-pdf-pages--empty')
  }

  function destroyDoc () {
    pdfDoc = null
    pdfPages = []
  }

  async function preparePagePaint (page, pageEl, scale) {
    const canvas = pageEl.querySelector('canvas')
    if (!canvas) return null
    const outputScale = window.devicePixelRatio || 1
    const cssW = Math.max(1, Math.floor(page.width * scale))
    const cssH = Math.max(1, Math.floor(page.height * scale))
    const offscreen = doc.createElement('canvas')
    offscreen.width = Math.max(1, Math.floor(cssW * outputScale))
    offscreen.height = Math.max(1, Math.floor(cssH * outputScale))
    const offCtx = offscreen.getContext('2d', { alpha: false })
    if (offCtx) {
      offCtx.imageSmoothingEnabled = true
      offCtx.imageSmoothingQuality = 'high'
      await paintPage(page, offCtx, { scale: scale * outputScale })
    }
    return { pageEl, canvas, offscreen, cssW, cssH }
  }

  function commitPagePaint (prepared) {
    const { pageEl, canvas, offscreen, cssW, cssH } = prepared
    canvas.width = offscreen.width
    canvas.height = offscreen.height
    canvas.style.width = cssW + 'px'
    canvas.style.height = cssH + 'px'
    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(offscreen, 0, 0)
    pageEl.style.width = cssW + 'px'
    pageEl.style.height = cssH + 'px'
  }

  async function renderAllPages (gen) {
    if (!pdfDoc || gen !== renderGen) return
    const total = pdfPages.length
    const zoom = zoomFactor
    const scale = pageRenderScale(zoom)
    if (pageEls.length !== total) mountPageEls(total)
    if (gen !== renderGen) return
    const prepared = []
    for (let i = 0; i < total; i++) {
      if (gen !== renderGen) return
      const pageEl = pageEls[i]
      if (!pageEl) continue
      const item = await preparePagePaint(pdfPages[i], pageEl, scale)
      if (item) prepared.push(item)
    }
    if (gen !== renderGen) return
    cssScale = 1
    renderedZoom = zoom
    applyInnerTransform()
    for (let i = 0; i < prepared.length; i++) {
      if (gen !== renderGen) return
      commitPagePaint(prepared[i])
    }
    if (gen !== renderGen) return
    syncContentMetrics()
    pagesEl.classList.toggle('report-pdf-pages--empty', total === 0)
    if (opts.onRendered) opts.onRendered({ pageCount: total, zoom })
  }

  async function loadBlob (blob) {
    const gen = ++renderGen
    clearTimeout(zoomSettleTimer)
    destroyDoc()
    clearPages()
    zoomFactor = ZOOM_DEFAULT
    renderedZoom = ZOOM_DEFAULT
    cssScale = 1
    syncLabel()
    applyInnerTransform()
    if (!blob) {
      if (opts.onRendered) opts.onRendered({ pageCount: 0, zoom: ZOOM_DEFAULT })
      return
    }
    try {
      const data = await blob.arrayBuffer()
      if (gen !== renderGen) return
      pdfDoc = PdfDocument.open(data)
      pdfPages = pdfDoc.getPages()
      if (gen !== renderGen) return
      syncLabel()
      await renderAllPages(gen)
    } catch (e) {
      if (gen !== renderGen) return
      destroyDoc()
      clearPages()
      syncLabel()
      if (opts.onError) opts.onError(e)
    }
  }

  function onWheel (e) {
    if (!e.ctrlKey && !e.metaKey) return
    if (!pdfDoc) return
    e.preventDefault()
    const magnitude = Math.min(0.06, Math.max(ZOOM_WHEEL_STEP, Math.abs(e.deltaY) * 0.0012))
    setZoom(zoomFactor + (e.deltaY > 0 ? -magnitude : magnitude))
  }

  function onKeydown (e) {
    const mod = e.ctrlKey || e.metaKey
    if (mod && (e.key === 'f' || e.key === 'F' || e.key === 'g' || e.key === 'G')) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  zoombar.addEventListener('click', (e) => {
    const z = e.target.closest('[data-z]')
    if (!z) return
    if (z.dataset.z === 'in') setZoom(zoomFactor + ZOOM_STEP)
    if (z.dataset.z === 'out') setZoom(zoomFactor - ZOOM_STEP)
  })
  pagesEl.addEventListener('wheel', onWheel, { passive: false })
  container.addEventListener('keydown', onKeydown)

  return {
    setBlob: loadBlob,
    destroy () {
      renderGen += 1
      clearTimeout(zoomSettleTimer)
      destroyDoc()
      clearPages()
      container.innerHTML = ''
    }
  }
}
