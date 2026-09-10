// 媒体位图生成:二维码 / 条形码 / 图片 → PNG Buffer,供 pdfkit.image 嵌入。
// 用与前端同款库(@niqer/barcode)与同口径尺寸(对照 reportBarcodeCanvas.js),
// 在 @napi-rs/canvas 上离屏绘制。
import './fonts.mjs'
import { createCanvas } from './fonts.mjs'
import { encode, paintToContext } from '@niqer/barcode'

// 尺寸口径:SSOT 见 tk-erp-vue3/src/utils/reportBarcodeCanvas.js(纯函数,极稳定,这里镜像)
export function previewQrCanvasSize (element) {
  return Math.max(10, Math.min(element.width || 100, element.height || 100) - 6)
}
export function previewBarcodeCanvasSize (element) {
  return {
    containerW: Math.max(10, (element.width || 200) - 6),
    containerH: Math.max(10, (element.height || 60) - 6)
  }
}

function paintSymbol (canvas, symbol, color, geometry) {
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = color || '#000000'
  paintToContext(ctx, symbol, geometry)
}

// 二维码 → PNG Buffer
export async function qrPng (content, element) {
  const size = previewQrCanvasSize(element)
  const canvas = createCanvas(size, size)
  const symbol = encode(String(content), { format: 'qrcode' })
  paintSymbol(canvas, symbol, element.style && element.style.color, {
    module: size / Math.max(1, symbol.width)
  })
  return canvas.toBuffer('image/png')
}

// 条形码 → PNG Buffer(napi canvas + @niqer/barcode, 尺寸口径不变)
export function barcodePng (content, element) {
  const { containerW, containerH } = previewBarcodeCanvasSize(element)
  const canvas = createCanvas(containerW, containerH)
  const format = element.barcodeFormat || 'code128'
  const symbol = encode(String(content), { format })
  const modules = symbol.modules && symbol.modules.length ? symbol.modules.length : (symbol.width || 1)
  paintSymbol(canvas, symbol, element.style && element.style.color, {
    module: containerW / Math.max(1, modules),
    height: containerH
  })
  return canvas.toBuffer('image/png')
}

// 图片源 → Buffer。安全口径:
//  - 默认只接受 dataURL(内网无外网抓取,http(s) 一律 null)。
//  - 本地文件读取默认禁止(src 来自 DB 数据,放开会造成任意文件读取,如 /etc/passwd)。
//  - 仅当显式配置 REPORT_IMAGE_BASE_DIR 白名单目录时,才允许读取该目录内文件,并规范化路径防 .. 穿越。
import fs from 'node:fs'
import path from 'node:path'

const IMAGE_BASE_DIR = process.env.REPORT_IMAGE_BASE_DIR
  ? path.resolve(process.env.REPORT_IMAGE_BASE_DIR)
  : null

export function imageBuffer (src) {
  if (!src || typeof src !== 'string') return null
  if (src.startsWith('data:')) {
    const comma = src.indexOf(',')
    if (comma === -1) return null
    return Buffer.from(src.slice(comma + 1), 'base64')
  }
  if (/^https?:\/\//i.test(src)) return null
  // 未配置白名单目录:拒绝一切本地路径(防任意文件读取)。
  if (!IMAGE_BASE_DIR) return null
  try {
    const resolved = path.resolve(IMAGE_BASE_DIR, src)
    // 规范化后必须仍落在白名单目录内,否则视为穿越攻击,拒绝。
    if (resolved !== IMAGE_BASE_DIR && !resolved.startsWith(IMAGE_BASE_DIR + path.sep)) return null
    return fs.existsSync(resolved) ? fs.readFileSync(resolved) : null
  } catch { return null }
}

// 只读位图 header 拿像素宽高(不整图解码,省内存),供 Excel 按原始宽高比 fit 居中,避免拉伸变形。
// 支持 PNG / JPEG / GIF / BMP;无法识别返回 null(调用方回退元素设计宽高)。
export function imageDimensions (buffer) {
  if (!buffer || buffer.length < 24) return null
  // PNG:89 50 4E 47 …,IHDR 的 width@16、height@20(大端 u32)
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  // GIF:'GIF8',width@6、height@8(小端 u16)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
  }
  // BMP:'BM',width@18、height@22(小端 i32,可能为负表示自上而下)
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return { width: Math.abs(buffer.readInt32LE(18)), height: Math.abs(buffer.readInt32LE(22)) }
  }
  // JPEG:FF D8 起,逐段跳到 SOF(C0-CF,排除 C4/C8/CC),读 height@+5、width@+7(大端 u16)
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let off = 2
    while (off + 9 < buffer.length) {
      if (buffer[off] !== 0xFF) { off++; continue }
      const marker = buffer[off + 1]
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { width: buffer.readUInt16BE(off + 7), height: buffer.readUInt16BE(off + 5) }
      }
      const segLen = buffer.readUInt16BE(off + 2)
      if (segLen < 2) break
      off += 2 + segLen
    }
  }
  return null
}

// 统一入口:按类型生成 Buffer(失败/无内容返回 null)
export async function generateMediaBuffer (placed) {
  const content = placed.parsedContent
  try {
    if (placed.type === 'qrcode') return content ? await qrPng(content, placed) : null
    if (placed.type === 'barcode') return content ? barcodePng(content, placed) : null
    if (placed.type === 'image') return imageBuffer(content)
  } catch (e) {
    return null
  }
  return null
}

// 带原始像素宽高的媒体生成(Excel 用):返回 { buffer, width, height }。
// 二维码为正方形(size×size),条形码为容器宽高(与 previewBarcodeCanvasSize 同口径),
// 图片则解析真实位图尺寸;失败/无内容返回 null。宽高用于按比例 fit 居中,保证不变形。
export async function generateMediaImage (placed) {
  const content = placed.parsedContent
  try {
    if (placed.type === 'qrcode') {
      if (!content) return null
      const size = previewQrCanvasSize(placed)
      const buffer = await qrPng(content, placed)
      return { buffer, width: size, height: size }
    }
    if (placed.type === 'barcode') {
      if (!content) return null
      const { containerW, containerH } = previewBarcodeCanvasSize(placed)
      const buffer = barcodePng(content, placed)
      return { buffer, width: containerW, height: containerH }
    }
    if (placed.type === 'image') {
      const buffer = imageBuffer(content)
      if (!buffer) return null
      const dim = imageDimensions(buffer) || { width: placed.width || 1, height: placed.height || 1 }
      return { buffer, width: Math.max(1, dim.width), height: Math.max(1, dim.height) }
    }
  } catch (e) {
    return null
  }
  return null
}
