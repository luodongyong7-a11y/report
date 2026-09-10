// Node 环境垫片:让 Pretext 在无浏览器下也能做文本度量。
// Pretext 的 measurement.js 通过 OffscreenCanvas 或 document.createElement('canvas') 拿
// CanvasRenderingContext2D 调 measureText。Node 没有这两者,这里用 @napi-rs/canvas 垫上。
//
// 必须在 import 任何会触发 Pretext 度量的代码之前先执行本模块(import 顺序放最前)。
import { GlobalFonts, createCanvas } from '@napi-rs/canvas'
import path from 'node:path'
import fs from 'node:fs'

const FONTS_DIR = 'C:\\Windows\\Fonts'

export const FONT_PATHS = {
  times: path.join(FONTS_DIR, 'times.ttf'),
  simsun: path.join(FONTS_DIR, 'simsun.ttc'),
  simhei: path.join(FONTS_DIR, 'simhei.ttf'),
}

// 报表 canonical 字号(reportElementStyle.REPORT_DEFAULT_FONT_SIZE_PX)
export const REPORT_FONT_SIZE_PX = 12
// 报表文本内容盒内边距(与 report-core fontPolicy.REPORT_TEXT_PADDING_PX 同源)
export const REPORT_TEXT_PADDING_PX = 1

// 注册字体(measureText 与 pdfkit 绘制要用同一批文件)。返回每个是否成功,便于发现 .ttc 加载问题。
export const fontRegistration = {}
for (const [key, p] of Object.entries(FONT_PATHS)) {
  const exists = fs.existsSync(p)
  let ok = false
  if (exists) {
    const alias = key === 'times' ? 'Times New Roman' : key === 'simsun' ? 'SimSun' : 'SimHei'
    try {
      ok = GlobalFonts.registerFromPath(p, alias)
    } catch (e) {
      ok = false
      console.warn(`registerFromPath 失败 ${key} (${p}): ${e.message}`)
    }
  }
  fontRegistration[key] = { path: p, exists, registered: ok }
}

// OffscreenCanvas 垫片(Pretext getMeasureContext 首选用它)。1x1 足够,measureText 不依赖画布尺寸。
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  globalThis.OffscreenCanvas = class OffscreenCanvasShim {
    constructor (w, h) { this._c = createCanvas(w || 1, h || 1) }
    getContext (type) { return this._c.getContext(type) }
  }
}

// 把 navigator 伪装成 Chromium,让 Pretext getEngineProfile 选 Chromium 档位
// (carryCJKAfterClosingQuote=true 等),与现有用户用的 Chrome/Edge 渲染口径对齐。
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      vendor: 'Google Inc.',
    },
    configurable: true,
  })
} catch (e) {
  console.warn('navigator 伪装失败(引擎档位可能非 Chromium):', e.message)
}

export { createCanvas, GlobalFonts }
