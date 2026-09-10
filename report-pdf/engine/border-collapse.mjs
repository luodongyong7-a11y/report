// 相邻单元格边框合并:仅当两侧盒体真实相交(面积重叠)时才合并共享边。
// 有间隙、或无间隙仅贴合(边线相接但外框不相交)时两侧各自完整绘制,不合并。
// 规则:每格「右、下」边完整绘制;「左、上」边扣除与之真实叠盒且同样有边框的邻格所覆盖的区段。
// 返回每个元素待绘制的边框线段(inside-box 像素定位),draw.mjs(PDF) 与 draw-html.mjs(HTML) 共用。
const EPS = 0.5

function borderWidthOf (el) {
  if (!el || !el.border) return 0
  return el.border.width || 1
}
function borderSidesOf (border) {
  if (!border) return { top: false, right: false, bottom: false, left: false }
  const flagged = border.top != null || border.right != null || border.bottom != null || border.left != null
  if (!flagged) return { top: true, right: true, bottom: true, left: true }
  return {
    top: border.top !== false,
    right: border.right !== false,
    bottom: border.bottom !== false,
    left: border.left !== false
  }
}
function borderColorOf (el) {
  return (el.border && el.border.color) || '#000'
}
function borderStyleOf (el) {
  const s = el.border && el.border.style
  return s === 'dashed' ? 'dashed' : s === 'dotted' ? 'dotted' : 'solid'
}

function overlapRange (a1, a2, b1, b2) {
  const s = Math.max(a1, b1)
  const e = Math.min(a2, b2)
  return e > s + EPS ? [s, e] : null
}

/** 盒体面积重叠量;贴合(ox/oy==0)或间隙(<0)均视为未叠加。 */
function boxOverlapXY (a, b) {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return { ox, oy }
}

function boxesTrulyOverlap (a, b) {
  const { ox, oy } = boxOverlapXY(a, b)
  return ox > EPS && oy > EPS
}

// 从 full=[s,e] 中扣除 covers(若干 [s,e]),返回剩余子区间。
function subtractRanges (full, covers) {
  let segs = [full]
  for (const c of covers) {
    const next = []
    for (const [s, e] of segs) {
      if (c[1] <= s + EPS || c[0] >= e - EPS) { next.push([s, e]); continue }
      if (c[0] > s + EPS) next.push([s, Math.min(c[0], e)])
      if (c[1] < e - EPS) next.push([Math.max(c[1], s), e])
    }
    segs = next
  }
  return segs.filter(([s, e]) => e - s > EPS)
}

/**
 * 计算一页内各元素待绘制的边框线段(已做共享边合并)。
 * @param {Array} elements 该页 placed 元素(含 x/y/width/height/border)
 * @returns {Array<Array<{orient:'v'|'h', left:number, top:number, len:number, bw:number, color:string, style:string}>>}
 *          与 elements 等长;每项为该元素的线段列表。orient='v' 竖线(高 len)、'h' 横线(宽 len);left/top 为边框盒左上像素。
 */
export function computeCollapsedBorders (elements) {
  const n = elements.length
  const bw = new Array(n)
  for (let i = 0; i < n; i++) bw[i] = borderWidthOf(elements[i])

  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = []
    const b = bw[i]
    if (b <= 0) continue
    const el = elements[i]
    const sides = borderSidesOf(el.border)
    if (!sides.top && !sides.right && !sides.bottom && !sides.left) continue
    const x = el.x, y = el.y, w = el.width, h = el.height
    const color = borderColorOf(el)
    const style = borderStyleOf(el)

    if (sides.right) out[i].push({ orient: 'v', left: x + w - b, top: y, len: h, bw: b, color, style })
    if (sides.bottom) out[i].push({ orient: 'h', left: x, top: y + h - b, len: w, bw: b, color, style })

    if (sides.left) {
      const leftCovers = []
      for (let j = 0; j < n; j++) {
        if (j === i || bw[j] <= 0) continue
        const e2 = elements[j]
        if (!borderSidesOf(e2.border).right) continue
        if (!boxesTrulyOverlap(el, e2)) continue
        if (!(e2.x < x - EPS && (e2.x + e2.width) > x + EPS)) continue
        const ov = overlapRange(y, y + h, e2.y, e2.y + e2.height)
        if (ov) leftCovers.push(ov)
      }
      for (const [s, e] of subtractRanges([y, y + h], leftCovers)) {
        out[i].push({ orient: 'v', left: x, top: s, len: e - s, bw: b, color, style })
      }
    }

    if (sides.top) {
      const topCovers = []
      for (let j = 0; j < n; j++) {
        if (j === i || bw[j] <= 0) continue
        const e2 = elements[j]
        if (!borderSidesOf(e2.border).bottom) continue
        if (!boxesTrulyOverlap(el, e2)) continue
        if (!(e2.y < y - EPS && (e2.y + e2.height) > y + EPS)) continue
        const ov = overlapRange(x, x + w, e2.x, e2.x + e2.width)
        if (ov) topCovers.push(ov)
      }
      for (const [s, e] of subtractRanges([x, x + w], topCovers)) {
        out[i].push({ orient: 'h', left: s, top: y, len: e - s, bw: b, color, style })
      }
    }
  }
  return out
}
