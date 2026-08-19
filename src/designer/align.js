import { borderWidthOf, snap } from './model.js'

function selected (tpl, ids) {
  return (tpl.elements || []).filter((el) => ids.has(el.id))
}

export function alignX (tpl, ids) {
  const els = selected(tpl, ids)
  if (els.length < 2) return false
  const ordered = els.slice().sort((a, b) => tpl.elements.indexOf(a) - tpl.elements.indexOf(b))
  const x0 = snap(ordered[0].x)
  for (const el of ordered) el.x = x0
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]
    const cur = ordered[i]
    const bottom = snap(prev.y + prev.height)
    const pb = borderWidthOf(prev)
    const ct = borderWidthOf(cur)
    cur.y = snap(pb > 0 && ct > 0 ? bottom - pb : bottom)
  }
  return true
}

export function alignY (tpl, ids) {
  const els = selected(tpl, ids)
  if (els.length < 2) return false
  const ordered = els.slice().sort((a, b) => tpl.elements.indexOf(a) - tpl.elements.indexOf(b))
  const y0 = snap(ordered[0].y)
  for (const el of ordered) el.y = y0
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]
    const cur = ordered[i]
    const right = snap(prev.x + prev.width)
    const pr = borderWidthOf(prev)
    const cl = borderWidthOf(cur)
    cur.x = snap(pr > 0 && cl > 0 ? right - pr : right)
  }
  return true
}

export function centerH (tpl, ids) {
  const els = selected(tpl, ids)
  if (!els.length) return false
  const minX = Math.min(...els.map((e) => e.x))
  const maxX = Math.max(...els.map((e) => e.x + e.width))
  const paperW = tpl.paperSize.width
  const offset = snap((paperW - (maxX - minX)) / 2) - minX
  for (const el of els) el.x = snap(el.x + offset)
  return true
}

export function centerV (tpl, ids) {
  const els = selected(tpl, ids)
  if (!els.length) return false
  const minY = Math.min(...els.map((e) => e.y))
  const maxY = Math.max(...els.map((e) => e.y + e.height))
  const paperH = tpl.paperSize.height
  const offset = snap((paperH - (maxY - minY)) / 2) - minY
  for (const el of els) el.y = snap(el.y + offset)
  return true
}

export function spaceAround (tpl, ids) {
  const els = selected(tpl, ids)
  if (els.length < 2) return false
  const ordered = els.slice().sort((a, b) => a.x - b.x)
  const totalW = ordered.reduce((s, e) => s + e.width, 0)
  const gap = snap((tpl.paperSize.width - totalW) / (ordered.length + 1))
  let x = gap
  for (const el of ordered) {
    el.x = snap(x)
    x = snap(x + el.width + gap)
  }
  return true
}

export function syncColumnWidths (tpl, ids) {
  const els = selected(tpl, ids)
  if (els.length < 2) return false
  const ordered = els.slice().sort((a, b) => a.y - b.y)
  const headerY = ordered[0].y
  const tol = 3.75
  const header = ordered.filter((e) => Math.abs(e.y - headerY) <= tol).sort((a, b) => a.x - b.x)
  const body = ordered.filter((e) => Math.abs(e.y - headerY) > tol).sort((a, b) => a.x - b.x)
  if (!header.length || !body.length) return false
  for (let i = 0; i < body.length && i < header.length; i++) {
    body[i].x = snap(header[i].x)
    body[i].width = snap(header[i].width)
  }
  const bodyYMin = Math.min(...body.map((e) => e.y))
  const bodyYMax = Math.max(...body.map((e) => e.y))
  const single = bodyYMax - bodyYMin <= tol
  if (single) {
    const ref = header[0]
    const hb = borderWidthOf(ref)
    const anyTop = body.some((e) => borderWidthOf(e) > 0)
    const y = snap(hb > 0 && anyTop ? ref.y + ref.height - hb : ref.y + ref.height)
    for (let i = 0; i < body.length && i < header.length; i++) body[i].y = y
  } else {
    for (let i = 0; i < body.length && i < header.length; i++) {
      const hb = borderWidthOf(header[i])
      const bt = borderWidthOf(body[i])
      body[i].y = snap(hb > 0 && bt > 0 ? header[i].y + header[i].height - hb : header[i].y + header[i].height)
    }
  }
  return true
}

export function borderSidesOf (border) {
  if (!border) return { top: false, right: false, bottom: false, left: false }
  const w = Number(border.width)
  if (!Number.isFinite(w) || w <= 0) return { top: false, right: false, bottom: false, left: false }
  const flagged = border.top != null || border.right != null || border.bottom != null || border.left != null
  if (!flagged) return { top: true, right: true, bottom: true, left: true }
  return {
    top: border.top !== false,
    right: border.right !== false,
    bottom: border.bottom !== false,
    left: border.left !== false
  }
}

export function writeBorder (el, draft, sides) {
  const on = !!(sides && (sides.top || sides.right || sides.bottom || sides.left))
  if (!on) {
    delete el.border
    return
  }
  const all = !!(sides.top && sides.right && sides.bottom && sides.left)
  const next = {
    width: Number(draft && draft.width) || Number(el.border && el.border.width) || 1,
    style: (draft && draft.style) || (el.border && el.border.style) || 'solid',
    color: (draft && draft.color) || (el.border && el.border.color) || '#000000'
  }
  if (!all) {
    next.top = !!sides.top
    next.right = !!sides.right
    next.bottom = !!sides.bottom
    next.left = !!sides.left
  }
  el.border = next
}

export function toggleBorder (tpl, ids, draft) {
  const els = selected(tpl, ids)
  if (!els.length) return false
  const on = !els.every((e) => {
    const s = borderSidesOf(e.border)
    return s.top || s.right || s.bottom || s.left
  })
  if (on) return setBorderOn(tpl, ids, draft)
  return setBorderOff(tpl, ids)
}

export function setBorderOn (tpl, ids, draft) {
  const els = selected(tpl, ids)
  if (!els.length) return false
  for (const el of els) writeBorder(el, draft, { top: true, right: true, bottom: true, left: true })
  return true
}

export function setBorderOff (tpl, ids) {
  const els = selected(tpl, ids)
  if (!els.length) return false
  for (const el of els) delete el.border
  return true
}

export function elementHasBorder (el) {
  const s = borderSidesOf(el && el.border)
  return !!(s.top || s.right || s.bottom || s.left)
}

export function borderStateOf (els) {
  if (!els || !els.length) return 'off'
  const keys = els.map((el) => {
    const s = borderSidesOf(el.border)
    return (s.top ? '1' : '0') + (s.right ? '1' : '0') + (s.bottom ? '1' : '0') + (s.left ? '1' : '0')
  })
  const first = keys[0]
  for (let i = 1; i < keys.length; i++) {
    if (keys[i] !== first) return 'mixed'
  }
  return first === '0000' ? 'off' : 'on'
}

export function toggleMainBorder (tpl, ids, draft) {
  const els = selected(tpl, ids)
  if (!els.length) return false
  if (els.some(elementHasBorder)) return setBorderOff(tpl, ids)
  return setBorderOn(tpl, ids, draft)
}

export function toggleBorderSide (tpl, ids, draft, side) {
  const els = selected(tpl, ids)
  if (!els.length) return false
  if (side !== 'top' && side !== 'right' && side !== 'bottom' && side !== 'left') return false
  for (const el of els) {
    const sides = borderSidesOf(el.border)
    sides[side] = !sides[side]
    writeBorder(el, draft, sides)
  }
  return true
}

export function applyBorderDraft (tpl, ids, draft) {
  const els = selected(tpl, ids)
  if (!els.length || !draft) return false
  const width = Number(draft.width)
  let changed = false
  for (const el of els) {
    if (!el.border || !Number(el.border.width)) continue
    const next = Object.assign({}, el.border)
    if (Number.isFinite(width) && width > 0) next.width = width
    if (draft.style) next.style = draft.style
    if (draft.color) next.color = draft.color
    if (next.width === el.border.width && next.style === el.border.style && next.color === el.border.color) continue
    el.border = next
    changed = true
  }
  return changed
}

export function applyTextStyle (tpl, ids, key, value) {
  const els = selected(tpl, ids)
  if (!els.length) return false
  for (const el of els) {
    if (key === 'textAlign') el[key] = value
    else if (key === 'verticalAlign') {
      if (el.type === 'text' || el.type === 'data') el[key] = value
    } else el.style = Object.assign({}, el.style || {}, { [key]: value })
  }
  return true
}

export function applyBarcodeFormat (tpl, ids, format, kind) {
  const els = selected(tpl, ids)
  if (!els.length) return false
  for (const el of els) {
    if (kind === 'qrcode' && el.type === 'qrcode') el.qrcodeFormat = format
    if (kind === 'barcode' && el.type === 'barcode') el.barcodeFormat = format
  }
  return true
}
