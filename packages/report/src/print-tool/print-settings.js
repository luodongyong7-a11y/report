const LS_KEY = 'tk-report.printSettings'

const PRESET_MM = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  B5: { widthMm: 176, heightMm: 250 }
}

function pxToMm (px) {
  const n = Number(px)
  if (!Number.isFinite(n) || n <= 0) return 0
  return (n * 25.4) / 96
}

export function normalizeSizeUnit (value) {
  return String(value || '').toLowerCase() === 'in' ? 'in' : 'mm'
}

export function defaultPrintSettings () {
  return {
    paperPreset: 'A4',
    widthMm: 210,
    heightMm: 297,
    orientation: 'portrait',
    printerNote: '',
    sizeUnit: 'mm'
  }
}

export function loadPrintSettings () {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return defaultPrintSettings()
    const parsed = JSON.parse(raw)
    const base = defaultPrintSettings()
    return {
      ...base,
      ...parsed,
      widthMm: Number(parsed.widthMm) > 0 ? Number(parsed.widthMm) : base.widthMm,
      heightMm: Number(parsed.heightMm) > 0 ? Number(parsed.heightMm) : base.heightMm,
      orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
      paperPreset: String(parsed.paperPreset || base.paperPreset).toUpperCase(),
      printerNote: String(parsed.printerNote || ''),
      sizeUnit: normalizeSizeUnit(parsed.sizeUnit ?? base.sizeUnit)
    }
  } catch {
    return defaultPrintSettings()
  }
}

export function savePrintSettings (settings = {}) {
  const previous = loadPrintSettings()
  const input = { ...previous, ...settings }
  const next = {
    ...defaultPrintSettings(),
    ...input,
    widthMm: Number(input.widthMm) > 0 ? Number(input.widthMm) : 210,
    heightMm: Number(input.heightMm) > 0 ? Number(input.heightMm) : 297,
    orientation: input.orientation === 'landscape' ? 'landscape' : 'portrait',
    paperPreset: String(input.paperPreset || 'CUSTOM').toUpperCase(),
    printerNote: String(input.printerNote || '').trim(),
    sizeUnit: normalizeSizeUnit(input.sizeUnit)
  }
  localStorage.setItem(LS_KEY, JSON.stringify(next))
  return next
}

export function paperMetaToSettings (meta = {}) {
  const preset = String(meta.paperPreset || meta.preset || '').toUpperCase()
  const orient = String(meta.paperOrientation || meta.orientation || 'portrait').toLowerCase()
  let widthMm = Number(meta.widthMm)
  let heightMm = Number(meta.heightMm)
  if (!(widthMm > 0 && heightMm > 0)) {
    if (preset && preset !== 'CUSTOM' && PRESET_MM[preset]) {
      widthMm = PRESET_MM[preset].widthMm
      heightMm = PRESET_MM[preset].heightMm
    } else {
      widthMm = pxToMm(meta.customPaperSize?.width ?? meta.widthPx ?? meta.paperWidth)
      heightMm = pxToMm(meta.customPaperSize?.height ?? meta.heightPx ?? meta.paperHeight)
    }
  }
  if (!(widthMm > 0 && heightMm > 0)) return loadPrintSettings()
  return {
    paperPreset: preset || 'CUSTOM',
    widthMm: Math.round(widthMm * 100) / 100,
    heightMm: Math.round(heightMm * 100) / 100,
    orientation: orient === 'landscape' ? 'landscape' : 'portrait',
    printerNote: loadPrintSettings().printerNote,
    sizeUnit: loadPrintSettings().sizeUnit
  }
}
