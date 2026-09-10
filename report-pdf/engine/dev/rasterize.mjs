// 把 PDF 各页渲染成 PNG(Node 内,用 pdfjs-dist + @napi-rs/canvas),供肉眼核对版面。
import '../fonts.mjs'
import { createCanvas } from '../fonts.mjs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', '..', 'out')

class NodeCanvasFactory {
  create (w, h) { const canvas = createCanvas(Math.ceil(w), Math.ceil(h)); return { canvas, context: canvas.getContext('2d') } }
  reset (cc, w, h) { cc.canvas.width = Math.ceil(w); cc.canvas.height = Math.ceil(h) }
  destroy (cc) { cc.canvas.width = 0; cc.canvas.height = 0 }
}

const pdfPath = process.argv[2] || path.join(OUT_DIR, 'engine-sample.pdf')
const scale = Number(process.argv[3] || 2)
const base = path.basename(pdfPath, '.pdf')

const data = new Uint8Array(fs.readFileSync(pdfPath))
const canvasFactory = new NodeCanvasFactory()
const doc = await pdfjs.getDocument({ data, canvasFactory, isEvalSupported: false, useSystemFonts: false }).promise
console.log(`页数: ${doc.numPages}`)

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const viewport = page.getViewport({ scale })
  const { canvas, context } = canvasFactory.create(viewport.width, viewport.height)
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: context, viewport, canvasFactory }).promise
  const out = path.join(OUT_DIR, `${base}-p${i}.png`)
  fs.writeFileSync(out, canvas.toBuffer('image/png'))
  console.log(`  ${out}  ${canvas.width}x${canvas.height}`)
}
