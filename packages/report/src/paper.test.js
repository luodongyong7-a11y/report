import { describe, expect, it } from 'vitest'
import { REPORT_SAFE_MARGIN_PX, reportSafeMarginPx } from './paper.js'

describe('reportSafeMarginPx', () => {
  it('keeps 10px inset for document reports', () => {
    expect(reportSafeMarginPx('document')).toBe(REPORT_SAFE_MARGIN_PX)
    expect(reportSafeMarginPx(undefined)).toBe(10)
  })

  it('is zero for labels', () => {
    expect(reportSafeMarginPx('label')).toBe(0)
  })
})
