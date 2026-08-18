// 规格: packages/report-vue/src/utils/reportBarcodeCanvas.js
// 禁止改公式、禁止 oss canvas-barcode 的 pad/DPR/Adobe
export function previewQrCanvasSize (element) {
  return Math.max(10, Math.min(element.width || 100, element.height || 100) - 6)
}

export function previewBarcodeCanvasSize (element) {
  const containerW = Math.max(10, (element.width || 200) - 6)
  const containerH = Math.max(10, (element.height || 60) - 6)
  return { containerW, containerH }
}

export function moduleCount (symbol) {
  if (symbol && symbol.modules && symbol.modules.length) return symbol.modules.length
  return (symbol && symbol.width) || 1
}

export function barcodeElementGeometry (element, symbol) {
  if (element && element.type === 'qrcode') {
    const size = previewQrCanvasSize(element)
    return {
      format: 'qrcode',
      module: size / Math.max(1, (symbol && symbol.width) || 1),
      height: size,
      color: (element.style && element.style.color) || '#000000'
    }
  }
  const { containerW, containerH } = previewBarcodeCanvasSize(element || {})
  return {
    format: (element && element.barcodeFormat) || 'code128',
    module: containerW / Math.max(1, moduleCount(symbol)),
    height: containerH,
    color: (element && element.style && element.style.color) || '#000000'
  }
}
