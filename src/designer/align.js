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

export function toggleBorder (tpl, ids, draft) {
  const els = selected(tpl, ids)
  if (!els.length) return false
  const on = !els.every((e) => e.border && e.border.width)
  for (const el of els) {
    if (on) {
      el.border = {
        width: Number(draft && draft.width) || 1,
        style: (draft && draft.style) || 'solid',
        color: (draft && draft.color) || '#000000'
      }
    } else delete el.border
  }
  return true
}

export function applyBorderDraft (tpl, ids, draft) {
  const els = selected(tpl, ids)
  if (!els.length) return false
  for (const el of els) {
    if (!el.border || !el.border.width) continue
    el.border = Object.assign({}, el.border, draft)
  }
  return true
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
