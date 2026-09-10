export const MERGE_GEOMETRY_TOLERANCE_PX = 3.75

const MERGE_THICK_OVERLAP_PX = 8
const MERGEABLE_TYPES = new Set(['text', 'data'])

export function validateTextDataOnly (elements) {
  if (!Array.isArray(elements) || elements.length < 2) {
    return { ok: false, reasonKey: '至少选两个文本' }
  }
  for (const el of elements) {
    if (!el || !MERGEABLE_TYPES.has(el.type)) {
      return { ok: false, reasonKey: '只能合并文本/数据' }
    }
  }
  return { ok: true, reasonKey: null }
}

function toRects (elements) {
  return elements.map((e) => ({ x: e.x, y: e.y, w: e.width, h: e.height }))
}

function axisOverlap1d (a1, a2, b1, b2) {
  return Math.min(a2, b2) - Math.max(a1, b1)
}

export function hasThickInteriorOverlap (a, b, thickPx = MERGE_THICK_OVERLAP_PX) {
  const ox = axisOverlap1d(a.x, a.x + a.w, b.x, b.x + b.w)
  const oy = axisOverlap1d(a.y, a.y + a.h, b.y, b.y + b.h)
  return ox > thickPx && oy > thickPx
}

function pairwiseIntersectionArea (a, b) {
  const ox = axisOverlap1d(a.x, a.x + a.w, b.x, b.x + b.w)
  const oy = axisOverlap1d(a.y, a.y + a.h, b.y, b.y + b.h)
  if (ox <= 0 || oy <= 0) return 0
  return ox * oy
}

function sumPairwiseIntersectionAreas (rects) {
  let s = 0
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) s += pairwiseIntersectionArea(rects[i], rects[j])
  }
  return s
}

function touchEdgeOrCorner (a, b, gapTol, borderOverlapMax) {
  if (hasThickInteriorOverlap(a, b)) return false
  const ox = axisOverlap1d(a.x, a.x + a.w, b.x, b.x + b.w)
  const oy = axisOverlap1d(a.y, a.y + a.h, b.y, b.y + b.h)
  const verticalSeam = ox >= -gapTol && ox <= borderOverlapMax && oy > gapTol
  const horizontalSeam = oy >= -gapTol && oy <= borderOverlapMax && ox > gapTol
  const corner = ox >= -gapTol && ox <= borderOverlapMax && oy >= -gapTol && oy <= borderOverlapMax
  return verticalSeam || horizontalSeam || corner
}

function validateNoThickOverlap (rects) {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (hasThickInteriorOverlap(rects[i], rects[j])) return false
    }
  }
  return true
}

function bboxAndSumArea (rects) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let sumArea = 0
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
    sumArea += r.w * r.h
  }
  return { minX, minY, maxX, maxY, bboxArea: (maxX - minX) * (maxY - minY), sumArea }
}

function tilingOk (bboxArea, sumArea, pairInterSum) {
  const base = Math.max(bboxArea, sumArea, 1)
  const holeEps = Math.max(2, 0.002 * base)
  if (sumArea + holeEps < bboxArea) return false
  const excess = sumArea - bboxArea
  if (excess <= holeEps) return true
  const slack = Math.max(50, 0.06 * base, pairInterSum * 1.6)
  return excess <= pairInterSum + slack
}

function isConnected (rects, gapTol, borderOverlapMax) {
  const n = rects.length
  if (n <= 1) return true
  const adj = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (touchEdgeOrCorner(rects[i], rects[j], gapTol, borderOverlapMax)) {
        adj[i].push(j)
        adj[j].push(i)
      }
    }
  }
  const seen = new Set([0])
  const stack = [0]
  while (stack.length) {
    const u = stack.pop()
    for (const v of adj[u]) {
      if (!seen.has(v)) {
        seen.add(v)
        stack.push(v)
      }
    }
  }
  return seen.size === n
}

export function validateMergeGeometryV2 (elements, tol = MERGE_GEOMETRY_TOLERANCE_PX) {
  const rects = toRects(elements)
  const gapTol = tol
  const borderOverlapMax = Math.max(MERGE_THICK_OVERLAP_PX, gapTol * 2)
  if (!validateNoThickOverlap(rects)) return { ok: false, reasonKey: '选区重叠，不能合并' }
  const { minX, minY, maxX, maxY, bboxArea, sumArea } = bboxAndSumArea(rects)
  const pairInterSum = sumPairwiseIntersectionAreas(rects)
  if (!tilingOk(bboxArea, sumArea, pairInterSum)) return { ok: false, reasonKey: '选区不是可拼接的矩形' }
  if (!isConnected(rects, gapTol, borderOverlapMax)) return { ok: false, reasonKey: '选区不连通' }
  return { ok: true, reasonKey: null, bbox: { minX, minY, width: maxX - minX, height: maxY - minY } }
}

export function validateMergeSelectionV2 (elements, tol = MERGE_GEOMETRY_TOLERANCE_PX) {
  const td = validateTextDataOnly(elements)
  if (!td.ok) return td
  return validateMergeGeometryV2(elements, tol)
}

export function buildMergedElementFromSorted (sortedElements, bbox, tol = MERGE_GEOMETRY_TOLERANCE_PX) {
  const first = sortedElements[0]
  const ys = sortedElements.map((e) => e.y)
  const sameRow = Math.max(...ys) - Math.min(...ys) <= tol
  const sep = sameRow ? ' ' : '\n'
  const parts = sortedElements.map((e) => (e.content || '').trim()).filter(Boolean)
  const content = parts.join(sep)
  const type = sortedElements.some((e) => (e.content || '').includes('${')) ? 'data' : 'text'
  const merged = Object.assign({}, JSON.parse(JSON.stringify(first)), {
    id: 'element_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11),
    type,
    x: Math.round(bbox.minX),
    y: Math.round(bbox.minY),
    width: Math.round(bbox.width),
    height: Math.round(bbox.height),
    content,
    mergeMode: 'none',
    mergeGroupBy: '',
    mergeSumField: '',
    mergeVerticalAlign: 'none'
  })
  delete merged.groupId
  delete merged.prevNodeId
  return merged
}
