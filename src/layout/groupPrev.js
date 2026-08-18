// groupId / prevNodeId 语义(与设计器 useLayoutCalculator 同源):
//
// groupId:
//   Y 与 height 都必须数值完全相等,并且 X 无间隙(相交或贴合 gap<=0；有间隙则拆组；可贴合传递)。
//   布局时对 groupId + index 取最大实测高,保证表格同行单元格等高。
//
// prevNodeId:
//   指向正上方 X 相交的元素(按 y 降序,逗号拼接;设计器首位通常=最近前驱)。
//   同视觉行判定保留 ±3 Y / ±1 height 容差(与 groupId 的「完全一致」分离):避免 1px 设计漂移把同行误当成上下前驱。
//   布局时 index===0:在全部 prevNodeId 已展开末实例中取落位底边最大者,再 + 与该前驱的模板设计间距
//   (间距负值=模板真实叠盒才叠;0=贴合不叠;正值=有间隙不叠;不用容差主动叠);
//   index>0 为 ds 展开多行,双边有框时自动扣边叠线。
//
// 适用带区:数据区、汇总B→页脚(二者流式级联规则相同;SBF 仅在分页上每页重复并上移紧跟数据底)。

const PREV_SAME_ROW_Y_TOLERANCE = 3
const PREV_SAME_ROW_H_TOLERANCE = 1

/** groupId: Y 与 height 数值完全相等(任一不同绝不能同组) */
function sameRowGeometry (a, b) {
  return Number(a.y || 0) === Number(b.y || 0) &&
    Number(a.height || 0) === Number(b.height || 0)
}

/** prev 用:同行(含轻微 Y/height 漂移)不做上下前驱。行距通常 ≈ height,远大于 3。 */
function sameRowForPrev (a, b) {
  return Math.abs(Number(a.y || 0) - Number(b.y || 0)) <= PREV_SAME_ROW_Y_TOLERANCE &&
    Math.abs(Number(a.height || 0) - Number(b.height || 0)) <= PREV_SAME_ROW_H_TOLERANCE
}

/** 同视觉行内：X 相交或无间隙(贴合 gap<=0)。gap>0 不能同组。 */
function xOverlapOrNoGap (a, b) {
  const aLeft = Number(a.x || 0)
  const aRight = aLeft + Number(a.width || 0)
  const bLeft = Number(b.x || 0)
  const bRight = bLeft + Number(b.width || 0)
  if (!(aRight <= bLeft || aLeft >= bRight)) return true
  const gap = aRight <= bLeft ? (bLeft - aRight) : (aLeft - bRight)
  return gap <= 0
}

function getBorderWidth (el) {
  return el?.border?.width ? Number(el.border.width) : 0
}

/**
 * 就地为带区内元素写入 groupId / prevNodeId。
 * @param {Array<{id?:string,x:number,y:number,width:number,height:number,border?:object}>} zoneElements
 * @param {string} groupIdPrefix
 */
export function assignGroupAndPrevNode (zoneElements, groupIdPrefix = 'group') {
  if (!zoneElements || zoneElements.length === 0) return

  zoneElements.forEach((el, index) => {
    if (!el.id) el.id = `element_${Date.now()}_${index}`
  })

  // 先按严格同 Y + 同 height 收成视觉行，再按 X 排序并在有间隙处拆成多个 group
  const sorted = [...zoneElements].sort((a, b) =>
    Number(a.y || 0) !== Number(b.y || 0)
      ? Number(a.y || 0) - Number(b.y || 0)
      : Number(a.x || 0) - Number(b.x || 0)
  )
  const yRows = []
  for (const el of sorted) {
    let found = null
    for (const row of yRows) {
      if (sameRowGeometry(el, row[0])) {
        found = row
        break
      }
    }
    if (found) found.push(el)
    else yRows.push([el])
  }

  const groups = []
  for (const row of yRows) {
    const byX = [...row].sort((a, b) => Number(a.x || 0) - Number(b.x || 0))
    let cur = [byX[0]]
    for (let i = 1; i < byX.length; i++) {
      const prev = byX[i - 1]
      const next = byX[i]
      if (xOverlapOrNoGap(prev, next)) {
        cur.push(next)
      } else {
        groups.push(cur)
        cur = [next]
      }
    }
    groups.push(cur)
  }

  groups.forEach((group, groupIndex) => {
    const groupId = `${groupIdPrefix}_${groupIndex}`
    group.forEach((el) => { el.groupId = groupId })
  })

  zoneElements.forEach(element => {
    const overlappingElements = zoneElements.filter(other => {
      if (other.id === element.id) return false
      // 同视觉行(含 ±3 Y 漂移)不做上下前驱;与 groupId 的「Y 完全一致」分离
      if (sameRowForPrev(other, element)) return false
      if (Number(other.y || 0) >= Number(element.y || 0)) return false

      const elementBorderW = getBorderWidth(element)
      const otherBorderW = getBorderWidth(other)
      const elementLeft = Number(element.x) + elementBorderW / 2
      const elementRight = Number(element.x) + Number(element.width) - elementBorderW / 2
      const otherLeft = Number(other.x) + otherBorderW / 2
      const otherRight = Number(other.x) + Number(other.width) - otherBorderW / 2

      return !(elementRight <= otherLeft || elementLeft >= otherRight)
    })

    if (overlappingElements.length > 0) {
      overlappingElements.sort((a, b) => Number(b.y) - Number(a.y))
      element.prevNodeId = overlappingElements.map(el => el.id).join(',')
    } else {
      element.prevNodeId = null
    }
  })
}

/**
 * 始终按几何刷新 groupId(纠正陈旧「不同 Y 同组」);
 * 若元素已有 prevNodeId 字段(含显式 null)则保留,仅缺省时用几何补齐。
 */
export function ensureGroupAndPrevNode (zoneElements, groupIdPrefix = 'group') {
  if (!zoneElements || zoneElements.length === 0) return
  const preservedPrev = new Map()
  let anyPrevDefined = false
  for (const el of zoneElements) {
    if (!el || el.id == null) continue
    if (Object.prototype.hasOwnProperty.call(el, 'prevNodeId')) {
      preservedPrev.set(el.id, el.prevNodeId)
      anyPrevDefined = true
    }
  }
  assignGroupAndPrevNode(zoneElements, groupIdPrefix)
  if (!anyPrevDefined) return
  for (const el of zoneElements) {
    if (preservedPrev.has(el.id)) el.prevNodeId = preservedPrev.get(el.id)
  }
}
