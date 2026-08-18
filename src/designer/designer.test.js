import { describe, expect, it } from 'vitest'
import { alignX, alignY } from './align.js'
import { defineDesignerElement, DESIGNER_TAG } from './element.js'
import { createBlankTemplate, createElement, normalizeDesignerTemplate, refreshGroups } from './model.js'

describe('niqer-designer', () => {
  it('registers the custom element tag', () => {
    expect(defineDesignerElement()).toBe('niqer-designer')
    expect(DESIGNER_TAG).toBe('niqer-designer')
  })

  it('creates a document template with bands and paper', () => {
    const t = createBlankTemplate()
    expect(t.paperSize.width).toBe(794)
    expect(t.paperSize.height).toBe(1123)
    expect(t.printKind).toBe('document')
    expect(t.headerY).toBeGreaterThan(0)
    expect(t.footerY).toBeLessThan(t.paperSize.height)
    expect(Array.isArray(t.elements)).toBe(true)
  })

  it('creates elements and aligns them', () => {
    const t = createBlankTemplate()
    const a = createElement('text', { x: 10, y: 10 })
    const b = createElement('text', { x: 40, y: 40 })
    t.elements.push(a, b)
    const ids = new Set([a.id, b.id])
    expect(alignX(t, ids)).toBe(true)
    expect(b.x).toBe(a.x)
    expect(alignY(t, ids)).toBe(true)
    expect(b.y).toBe(a.y)
  })

  it('writes groupId for same-row data-band cells', () => {
    const t = normalizeDesignerTemplate({
      printKind: 'document',
      paperSize: { width: 400, height: 300 },
      headerY: 20,
      summaryA: 200,
      summaryB: 230,
      footerY: 260,
      elements: [
        { id: 'a', type: 'text', x: 0, y: 40, width: 80, height: 20, content: '${ds1.n}' },
        { id: 'b', type: 'text', x: 80, y: 40, width: 80, height: 20, content: '${ds1.q}' }
      ]
    })
    refreshGroups(t)
    expect(t.elements[0].groupId).toBeTruthy()
    expect(t.elements[0].groupId).toBe(t.elements[1].groupId)
  })
})
