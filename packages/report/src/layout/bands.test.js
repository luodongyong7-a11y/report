import { describe, expect, it } from 'vitest'
import { isSummaryEnabled, resolveBandEdges } from './bands.js'

describe('bands', () => {
  it('defaults summaryEnabled to true when missing', () => {
    expect(isSummaryEnabled({})).toBe(true)
    expect(isSummaryEnabled({ summaryEnabled: true })).toBe(true)
    expect(isSummaryEnabled({ summaryEnabled: false })).toBe(false)
  })

  it('collapses summary bands to footer when disabled', () => {
    const edges = resolveBandEdges({
      summaryEnabled: false,
      headerY: 0,
      footerY: 384,
      summaryA: 200,
      summaryB: 250,
      paperSize: { width: 384, height: 384 },
    })
    expect(edges.summaryEnabled).toBe(false)
    expect(edges.headerY).toBe(0)
    expect(edges.footerY).toBe(384)
    expect(edges.summaryA).toBe(384)
    expect(edges.summaryB).toBe(384)
  })

  it('keeps summary edges when enabled', () => {
    const edges = resolveBandEdges({
      headerY: 60,
      summaryA: 700,
      summaryB: 760,
      footerY: 1063,
    })
    expect(edges.summaryEnabled).toBe(true)
    expect(edges.summaryA).toBe(700)
    expect(edges.summaryB).toBe(760)
  })
})
