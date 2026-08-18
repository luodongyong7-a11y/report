export const REPORT_PRESET_PX = {
  A4: { width: 794, height: 1123 },
  A5: { width: 559, height: 794 },
  B5: { width: 665, height: 945 }
}

export const REPORT_SAFE_MARGIN_PX = 10

/** Document reports keep a 10px print-safe inset. Labels print edge-to-edge. */
export function reportSafeMarginPx (printKind) {
  return printKind === 'label' ? 0 : REPORT_SAFE_MARGIN_PX
}

export function normalizePresetKey(s) {
  if (s == null || typeof s !== 'string') return null
  const t = s.trim()
  if (/^custom$/i.test(t)) return 'CUSTOM'
  const u = t.toUpperCase()
  if (u === 'A4' || u === 'A5' || u === 'B5' || u === 'CUSTOM') return u
  return null
}

export function normalizeOrientationKey(s) {
  if (s == null || typeof s !== 'string') return null
  const t = s.trim().toLowerCase()
  if (t === 'portrait' || t === 'landscape') return t
  return null
}

export function inferPaperMetaFromSize(w, h) {
  const rw = Math.round(Number(w))
  const rh = Math.round(Number(h))
  if (!Number.isFinite(rw) || !Number.isFinite(rh) || rw <= 0 || rh <= 0) {
    return {
      paperPreset: 'A4',
      paperOrientation: 'portrait',
      customPaperSize: { ...REPORT_PRESET_PX.A4 }
    }
  }
  for (const name of Object.keys(REPORT_PRESET_PX)) {
    const dim = REPORT_PRESET_PX[name]
    if (dim.width === rw && dim.height === rh) {
      return {
        paperPreset: name,
        paperOrientation: 'portrait',
        customPaperSize: { ...dim }
      }
    }
    if (dim.width === rh && dim.height === rw) {
      return {
        paperPreset: name,
        paperOrientation: 'landscape',
        customPaperSize: { ...dim }
      }
    }
  }
  if (rw > rh) {
    return {
      paperPreset: 'CUSTOM',
      paperOrientation: 'landscape',
      customPaperSize: { width: rh, height: rw }
    }
  }
  return {
    paperPreset: 'CUSTOM',
    paperOrientation: 'portrait',
    customPaperSize: { width: rw, height: rh }
  }
}

function readCustomPaperSizeMm(templateData) {
  const mm = templateData?.customPaperSizeMm
  const widthMm = mm != null ? Number(mm.width) : 0
  const heightMm = mm != null ? Number(mm.height) : 0
  if (!(widthMm > 0 && heightMm > 0)) return null
  return {
    width: Math.round(widthMm * 100) / 100,
    height: Math.round(heightMm * 100) / 100
  }
}

export function readPaperMetaFromTemplate(templateData, paperW, paperH) {
  const preset = normalizePresetKey(templateData?.paperPreset)
  const orient = normalizeOrientationKey(templateData?.paperOrientation)
  const custom = templateData?.customPaperSize
  const cw = custom != null ? Math.round(Number(custom.width)) : 0
  const ch = custom != null ? Math.round(Number(custom.height)) : 0
  const metaComplete =
    preset &&
    orient &&
    (preset !== 'CUSTOM' || (cw > 0 && ch > 0))

  if (metaComplete) {
    if (preset === 'CUSTOM') {
      const customMm = readCustomPaperSizeMm(templateData)
      const meta = {
        paperPreset: 'CUSTOM',
        paperOrientation: orient,
        customPaperSize: { width: cw, height: ch }
      }
      if (customMm) {
        meta.customPaperSizeMm = customMm
        meta.widthMm = customMm.width
        meta.heightMm = customMm.height
      }
      return meta
    }
    const dim = REPORT_PRESET_PX[preset]
    return {
      paperPreset: preset,
      paperOrientation: orient,
      customPaperSize: dim ? { ...dim } : { width: paperW, height: paperH }
    }
  }
  return inferPaperMetaFromSize(paperW, paperH)
}
