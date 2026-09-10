const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_STEP = 0.05
const ZOOM_WHEEL_STEP = 0.03
const ZOOM_SETTLE_MS = 160
const ZOOM_DEFAULT = 1
const PDF_CSS_SCALE = 96 / 72

function clampZoom (v) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 1000) / 1000))
}

function pageRenderScale (zoom) {
  return PDF_CSS_SCALE * zoom
}

function createPaintWorker () {
  const Ctor = globalThis.Worker
  const name = 'pdf-paint-worker.js'
  if (typeof Ctor !== 'function') throw new Error('Worker')
  return new Ctor(new URL(name, import.meta.url), { type: 'module' })
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
  const inner = doc.createElement('div')
  inner.className = 'report-pdf-pages-inner'
  pagesEl.appendChild(inner)
  container.appendChild(zoombar)
  container.appendChild(pagesEl)

  const btnOut = zoombar.querySelector('[data-z=out]')
  const btnIn = zoombar.querySelector('[data-z=in]')
  const label = zoombar.querySelector('.report-pdf-zoombar__label')

  let worker = null
  let sessionId = 0
  let pdfPages = []
  let pageEls = []
  let renderGen = 0
  let zoomFactor = ZOOM_DEFAULT
  let zoomSettleTimer = null
  let io = null
  let paintQueue = []
  let painting = false
  const painted = new Set()

  function syncLabel () {
    label.textContent = Math.round(zoomFactor * 100) + '%'
    const hasPages = pdfPages.length > 0
    btnOut.disabled = !hasPages
    btnIn.disabled = !hasPages
  }

  function pageCssSize (page, zoom) {
    const scale = pageRenderScale(zoom)
    return {
      w: Math.max(1, Math.floor(page.width * scale)),
      h: Math.max(1, Math.floor(page.height * scale)),
      scale
    }
  }

  function sizePageEl (pageEl, page, zoom) {
    const { w, h } = pageCssSize(page, zoom)
    pageEl.style.width = w + 'px'
    pageEl.style.height = h + 'px'
    return { w, h }
  }

  function mountPageEls (total) {
    inner.innerHTML = ''
    pageEls = []
    painted.clear()
    paintQueue = []
    for (let i = 0; i < total; i++) {
      const pageEl = doc.createElement('div')
      pageEl.className = 'report-pdf-page'
      pageEl.dataset.page = String(i)
      const canvas = doc.createElement('canvas')
      canvas.className = 'report-pdf-page__canvas'
      pageEl.appendChild(canvas)
      sizePageEl(pageEl, pdfPages[i], zoomFactor)
      inner.appendChild(pageEl)
      pageEls.push(pageEl)
    }
  }

  function stopIo () {
    if (!io) return
    io.disconnect()
    io = null
  }

  function startIo () {
    stopIo()
    if (typeof IntersectionObserver === 'undefined') {
      for (let i = 0; i < pageEls.length; i++) enqueue(i)
      return
    }
    io = new IntersectionObserver((entries) => {
      for (const ent of entries) {
        if (!ent.isIntersecting) continue
        enqueue(Number(ent.target.dataset.page))
      }
    }, { root: pagesEl, rootMargin: '180px 0px', threshold: 0.01 })
    for (const el of pageEls) io.observe(el)
  }

  function enqueue (index) {
    if (!Number.isInteger(index) || index < 0 || index >= pageEls.length) return
    if (painted.has(index + ':' + zoomFactor)) return
    if (paintQueue.includes(index)) return
    paintQueue.push(index)
    pump()
  }

  function pump () {
    if (painting || !worker || !sessionId) return
    while (paintQueue.length) {
      const index = paintQueue.shift()
      if (painted.has(index + ':' + zoomFactor)) continue
      const page = pdfPages[index]
      const pageEl = pageEls[index]
      if (!page || !pageEl) continue
      const { w, h, scale } = pageCssSize(page, zoomFactor)
      painting = true
      worker.postMessage({
        type: 'paint',
        id: sessionId,
        pageIndex: index,
        width: w,
        height: h,
        scale,
        zoom: zoomFactor
      })
      return
    }
  }

  function fillBlank (index) {
    const pageEl = pageEls[index]
    const page = pdfPages[index]
    if (!pageEl || !page) return
    const canvas = pageEl.querySelector('canvas')
    if (!canvas) return
    const { w, h } = pageCssSize(page, zoomFactor)
    canvas.width = w
    canvas.height = h
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
  }

  function applyBitmap (index, zoom, bitmap) {
    try {
      if (zoom !== zoomFactor) return
      const pageEl = pageEls[index]
      const page = pdfPages[index]
      if (!pageEl || !page) return
      const canvas = pageEl.querySelector('canvas')
      if (!canvas) return
      const { w, h } = pageCssSize(page, zoomFactor)
      canvas.width = w
      canvas.height = h
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      pageEl.style.width = w + 'px'
      pageEl.style.height = h + 'px'
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, w, h)
      painted.add(index + ':' + zoomFactor)
      pagesEl.classList.remove('report-pdf-pages--empty')
    } finally {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close()
    }
  }

  function onWorkerMessage (ev) {
    const msg = ev.data || {}
    if (msg.id !== sessionId) return
    if (msg.type === 'opened') {
      pdfPages = Array.isArray(msg.pages) ? msg.pages : []
      syncLabel()
      mountPageEls(pdfPages.length)
      pagesEl.classList.toggle('report-pdf-pages--empty', pdfPages.length === 0)
      startIo()
      if (opts.onRendered) opts.onRendered({ pageCount: pdfPages.length, zoom: zoomFactor })
      return
    }
    if (msg.type === 'painted') {
      painting = false
      applyBitmap(msg.pageIndex, msg.zoom, msg.bitmap)
      pump()
      return
    }
    if (msg.type === 'error') {
      painting = false
      if (typeof msg.pageIndex === 'number') {
        fillBlank(msg.pageIndex)
        painted.add(msg.pageIndex + ':' + zoomFactor)
        pump()
        return
      }
      pdfPages = []
      clearPages()
      syncLabel()
      if (opts.onError) opts.onError(new Error(msg.message || 'pdf'))
    }
  }

  function onWorkerError (err) {
    painting = false
    pdfPages = []
    clearPages()
    syncLabel()
    if (opts.onError) opts.onError(err || new Error('pdf worker'))
  }

  function ensureWorker () {
    if (worker) return worker
    worker = createPaintWorker()
    worker.onmessage = onWorkerMessage
    worker.onerror = onWorkerError
    return worker
  }

  function terminateWorker () {
    if (!worker) return
    try { worker.terminate() } catch { /* ignore */ }
    worker = null
  }

  function setZoom (next) {
    if (!pdfPages.length) return
    const value = clampZoom(next)
    if (value === zoomFactor) return
    zoomFactor = value
    syncLabel()
    for (let i = 0; i < pageEls.length; i++) sizePageEl(pageEls[i], pdfPages[i], zoomFactor)
    clearTimeout(zoomSettleTimer)
    zoomSettleTimer = setTimeout(() => {
      if (!pdfPages.length) return
      paintQueue = []
      startIo()
    }, ZOOM_SETTLE_MS)
  }

  function clearPages () {
    stopIo()
    paintQueue = []
    painted.clear()
    pageEls = []
    inner.innerHTML = ''
    pagesEl.classList.add('report-pdf-pages--empty')
  }

  async function loadBlob (blob) {
    const gen = ++renderGen
    sessionId += 1
    const sid = sessionId
    painting = false
    clearTimeout(zoomSettleTimer)
    pdfPages = []
    clearPages()
    zoomFactor = ZOOM_DEFAULT
    syncLabel()
    if (!blob) {
      if (opts.onRendered) opts.onRendered({ pageCount: 0, zoom: ZOOM_DEFAULT })
      return
    }
    try {
      const data = await blob.arrayBuffer()
      if (gen !== renderGen) return
      ensureWorker()
      if (sid !== sessionId) return
      worker.postMessage({ type: 'open', id: sid, buffer: data }, [data])
    } catch (e) {
      if (gen !== renderGen) return
      pdfPages = []
      clearPages()
      syncLabel()
      if (opts.onError) opts.onError(e)
    }
  }

  function onWheel (e) {
    if (!e.ctrlKey && !e.metaKey) return
    if (!pdfPages.length) return
    if (e.cancelable) e.preventDefault()
    const magnitude = Math.min(0.06, Math.max(ZOOM_WHEEL_STEP, Math.abs(e.deltaY) * 0.0012))
    setZoom(zoomFactor + (e.deltaY > 0 ? -magnitude : magnitude))
  }

  zoombar.addEventListener('click', (e) => {
    const z = e.target.closest('[data-z]')
    if (!z) return
    if (z.dataset.z === 'in') setZoom(zoomFactor + ZOOM_STEP)
    if (z.dataset.z === 'out') setZoom(zoomFactor - ZOOM_STEP)
  })
  pagesEl.addEventListener('wheel', onWheel, { passive: false })

  return {
    setBlob: loadBlob,
    destroy () {
      renderGen += 1
      sessionId += 1
      painting = false
      clearTimeout(zoomSettleTimer)
      stopIo()
      terminateWorker()
      pdfPages = []
      clearPages()
      container.innerHTML = ''
    }
  }
}
