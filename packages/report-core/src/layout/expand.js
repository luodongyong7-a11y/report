// report-core Stage1:明细展开(占位符替换 / 数组迭代 / 聚合检测),纯函数、框架无关。
// 不做度量:每个实例的 actualHeight 由调用方各自的度量后端填充
//   - 边车:napi measureCellHeight(无头,确定性)
//   - 设计器:DOM offsetHeight(浏览器实测)
// 表达式语义复用 reportExpressions(同一份源码),零漂移。
//
// 同组跟随:数据区/SBF 内,若同 groupId 已有组件按 ds 数组迭代,
// 无自身数组占位的 text(及同组其它静态格)跟随该数组循环渲染,保证表格行边框/空列齐全。
import {
  replacePlaceholders,
  getFirstPlaceholderToken,
  getIterationArrayPath,
  resolveIterableArrayFromDataset,
  parseVariableForReport,
  resolveRowCondBackgroundColor,
  sanitizeReportDisplayedText
} from '../expressions.js'

const PLACEHOLDER_IN_CONTENT_RE = /\$\{[^}]+\}/

// 预览用「空值兜底告警」:元素声明 tolerateNullish===false,且占位符解析出空串时,标记告警(设计器渲染黄色底)。
// 边车忽略此字段(最终产物不显示告警),故对 PDF/XLSX 布局无影响。
function supplementPreviewNullishWarning (element, replacedContent, nullishSeen) {
  if (element.tolerateNullish !== false) return nullishSeen
  if (nullishSeen) return true
  if (!PLACEHOLDER_IN_CONTENT_RE.test(element.content || '')) return false
  return sanitizeReportDisplayedText(replacedContent) === ''
}

/** 解析元素自身是否绑定可迭代 ds 数组。 */
function resolveOwnArrayIteration (content, dataset) {
  const firstToken = getFirstPlaceholderToken(content)
  if (!firstToken) return null
  const pathForArray = getIterationArrayPath(firstToken, dataset)
  if (!pathForArray) return null
  const rows = resolveIterableArrayFromDataset(dataset, pathForArray)
  if (!Array.isArray(rows)) return null
  return { path: pathForArray, rows }
}

/**
 * 预扫可迭代带区:每个 groupId 若有任一元素绑定 ds 数组,记下该路径与行集,
 * 供同组无自身数组绑定的 text/静态格跟随循环。
 */
function buildGroupArrayIteration (elements, dataset, headerY, summaryA, summaryB, footerY) {
  const groupIter = new Map()
  for (const element of elements) {
    const y = element.y || 0
    const inDataArea = y >= headerY && y < summaryA
    const inSbfArea = typeof summaryB === 'number' && typeof footerY === 'number' &&
      y >= summaryB && y < footerY
    if (!(inDataArea || inSbfArea)) continue
    const gid = element.groupId
    if (!gid || groupIter.has(gid)) continue
    const own = resolveOwnArrayIteration(element.content || '', dataset)
    if (own) groupIter.set(gid, own)
  }
  return groupIter
}

/**
 * @param {object} templateData 已填 dataset 的模板(headerY/summaryA/summaryB/footerY/elements/dataset)
 * @returns {{ renderedElements: Array, sumSet: Set, subtotalSet: Set }}
 *   每个 renderedElement:{ id, original, index, parsedContent, displayContent, expressionPath,
 *                          rowItem, previewRowHighlightBackground, previewNullishWarning,
 *                          inDataArea, inSbfArea }
 *   actualHeight 需由调用方度量后填充。
 */
export function expandElements (templateData) {
  const dataset = templateData.dataset || {}
  const elements = templateData.elements || []
  const renderedElements = []
  const sumSet = new Set()
  const subtotalSet = new Set()
  const summaryB = templateData.summaryB
  const footerY = templateData.footerY
  const groupIter = buildGroupArrayIteration(
    elements, dataset,
    templateData.headerY, templateData.summaryA, summaryB, footerY
  )

  const pushEl = (element, index, replacedContent, expressionPath, rowItem, rowBg, previewNullishWarning, inDataArea, inSbfArea) => {
    renderedElements.push({
      id: `${element.id || 'element'}_${index}`,
      original: element,
      index,
      parsedContent: replacedContent,
      displayContent: sanitizeReportDisplayedText(replacedContent),
      expressionPath,
      rowItem,
      previewRowHighlightBackground: rowBg,
      previewNullishWarning: previewNullishWarning || false,
      inDataArea,
      inSbfArea,
      actualHeight: 0
    })
  }

  const expandByRows = (element, content, pathForArray, rowItems, canIterate, inDataArea, inSbfArea) => {
    const items = rowItems.length > 0 ? rowItems : (canIterate ? [] : [undefined])
    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      if (index !== 0 && !canIterate) continue
      const nullishReport = { seen: false }
      const replacedContent = PLACEHOLDER_IN_CONTENT_RE.test(content)
        ? replacePlaceholders(content, {
          parseDataset: (path) => parseVariableForReport(dataset, path),
          rowItem: item,
          rowIndex: index,
          formatElement: element,
          nullishReport
        })
        : content
      const previewNullishWarning = supplementPreviewNullishWarning(
        element, replacedContent, element.tolerateNullish === false && nullishReport.seen
      )
      const rowBg = resolveRowCondBackgroundColor(element, item)
      pushEl(element, index, replacedContent, pathForArray, item, rowBg, previewNullishWarning, inDataArea, inSbfArea)
    }
  }

  for (const element of elements) {
    const content = element.content || ''

    if (typeof content === 'string') {
      const sub = content.match(/\$\{subtotal\(([^}]*)\)\}/)
      const sum = content.match(/\$\{sum\(([^}]*)\)\}/)
      if (sub && !subtotalSet.has(sub[1])) subtotalSet.add(sub[1])
      if (sum && !sumSet.has(sum[1])) sumSet.add(sum[1])
    }

    const inDataArea = element.y >= templateData.headerY && element.y < templateData.summaryA
    // 汇总B→页脚:与数据区一样可数组展开 + 自增高(group/prev 级联在 flow 中处理)。
    const inSbfArea = typeof summaryB === 'number' && typeof footerY === 'number' &&
      element.y >= summaryB && element.y < footerY
    const canIterate = inDataArea || inSbfArea
    const expressions = content.match(/\$\{([^}]+)\}/g) || []
    const own = resolveOwnArrayIteration(content, dataset)

    if (own) {
      expandByRows(element, content, own.path, own.rows, canIterate, inDataArea, inSbfArea)
      continue
    }

    // 同组有 ds 数组迭代时:无自身数组绑定的 text/静态格跟随循环(含空 content 边框格)
    const peer = (canIterate && element.groupId) ? groupIter.get(element.groupId) : null
    if (peer) {
      expandByRows(element, content, peer.path, peer.rows, canIterate, inDataArea, inSbfArea)
      continue
    }

    if (expressions.length === 0) {
      pushEl(element, 0, content, null, null, null, false, inDataArea, inSbfArea)
      continue
    }

    const nullishReport = { seen: false }
    const replacedContent = replacePlaceholders(content, {
      parseDataset: (path) => parseVariableForReport(dataset, path),
      formatElement: element,
      nullishReport
    })
    const previewNullishWarning = supplementPreviewNullishWarning(
      element, replacedContent, element.tolerateNullish === false && nullishReport.seen
    )
    const rowBg = resolveRowCondBackgroundColor(element, null)
    pushEl(element, 0, replacedContent, null, null, rowBg, previewNullishWarning, inDataArea, inSbfArea)
  }

  return { renderedElements, sumSet, subtotalSet }
}
