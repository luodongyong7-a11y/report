/**
 * Whether summary / subtotal bands (summaryA–summaryB and SBF) are active.
 * Missing field → true (legacy templates).
 */
export function isSummaryEnabled (templateData) {
  if (!templateData || typeof templateData !== 'object') return true
  return templateData.summaryEnabled !== false
}

/**
 * Effective band edges for layout/expand.
 * When summary is off: data zone spans headerY .. footerY (no summary/SBF bands).
 */
export function resolveBandEdges (templateData) {
  const headerY = Number(templateData?.headerY)
  const footerY = Number(templateData?.footerY)
  const enabled = isSummaryEnabled(templateData)
  if (!enabled) {
    const hy = Number.isFinite(headerY) ? headerY : 0
    const fy = Number.isFinite(footerY) ? footerY : (templateData?.paperSize?.height || 1123)
    return {
      summaryEnabled: false,
      headerY: hy,
      summaryA: fy,
      summaryB: fy,
      footerY: fy,
    }
  }
  return {
    summaryEnabled: true,
    headerY,
    summaryA: Number(templateData?.summaryA),
    summaryB: Number(templateData?.summaryB),
    footerY,
  }
}
