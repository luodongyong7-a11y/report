import { PdfDocument, paintPage } from '@niqer/pdf'

const docs = new Map()

self.onmessage = async (ev) => {
  const msg = ev.data || {}
  try {
    if (msg.type === 'open') {
      const doc = PdfDocument.open(msg.buffer)
      const pages = doc.getPages()
      docs.set(msg.id, { doc, pages })
      self.postMessage({
        type: 'opened',
        id: msg.id,
        pages: pages.map((page) => ({ width: page.width, height: page.height }))
      })
      return
    }
    if (msg.type === 'paint') {
      const rec = docs.get(msg.id)
      if (!rec || !rec.pages[msg.pageIndex]) throw new Error('page')
      const page = rec.pages[msg.pageIndex]
      const canvas = new OffscreenCanvas(msg.width, msg.height)
      const ctx = canvas.getContext('2d', { alpha: false })
      await paintPage(page, ctx, { scale: msg.scale, yieldEvery: 0 })
      const bitmap = canvas.transferToImageBitmap()
      self.postMessage({
        type: 'painted',
        id: msg.id,
        pageIndex: msg.pageIndex,
        zoom: msg.zoom,
        bitmap
      }, [bitmap])
      return
    }
    if (msg.type === 'close') {
      docs.delete(msg.id)
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: msg.id,
      pageIndex: msg.pageIndex,
      message: String(err && err.message ? err.message : err)
    })
  }
}
