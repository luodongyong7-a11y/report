import Decimal from './vendor/decimal.js'

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

const PLACEHOLDER_RE = /\$\{([^}]+)\}/g

const ROW_INDEX_RE = /^row\(\s*(.+?)\s*\)$/i

function matchRowIndexInner (token) {
  const t = String(token).trim()
  const m = t.match(ROW_INDEX_RE)
  return m ? m[1].trim() : null
}

function isDatasetDescriptor (raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return false
  if (!Array.isArray(raw.data)) return false
  if (typeof raw.type === 'string' && raw.type) return true
  if (Array.isArray(raw.fields)) return true
  return false
}

function unwrapDatasetRoot (obj, key) {
  if (obj == null || key == null) return undefined
  const raw = obj[key]
  if (raw == null) return raw
  if (Array.isArray(raw)) return raw
  // Designer datasets (Excel/SQL/API) store rows on `.data`. Keys may be
  // `ds1` or a custom name like an order id; only unwrap real descriptors.
  if (isDatasetDescriptor(raw)) return raw.data
  if (typeof raw === 'object' && Array.isArray(raw.data) && /^ds\d+$/i.test(String(key))) {
    return raw.data
  }
  return raw
}

export function parseVariableForReport (obj, path) {
  if (!obj || path == null) return undefined
  const keys = String(path).split('.').filter((k) => k !== '')
  if (keys.length === 0) return undefined
  if (keys.length === 1) {
    return unwrapDatasetRoot(obj, keys[0])
  }
  const parentPath = keys.slice(0, -1)
  const parentValue = parentPath.reduce((current, key, idx) => {
    if (current == null) return undefined
    if (idx === 0) {
      return unwrapDatasetRoot(current, key)
    }
    return current[key] !== undefined ? current[key] : undefined
  }, obj)
  if (Array.isArray(parentValue)) {
    if (parentValue.length === 0) return undefined
    const lastKey = keys[keys.length - 1]
    const first = parentValue[0]
    if (first != null && typeof first === 'object' && !Array.isArray(first)) {
      return first[lastKey]
    }
    return undefined
  }
  return keys.reduce((current, key, idx) => {
    if (current == null) return undefined
    if (idx === 0) {
      return unwrapDatasetRoot(current, key)
    }
    return current[key] !== undefined ? current[key] : undefined
  }, obj)
}

export function getRowField (rowItem, path) {
  if (rowItem == null || path == null) return undefined
  const keys = String(path).split('.').filter((k) => k !== '')
  if (keys.length === 0) return undefined
  let cur = rowItem
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return undefined
    cur = cur[k]
  }
  return cur
}

export function rowItemFieldPathFromMergeSetting (path) {
  if (path == null || path === '') return ''
  const s = String(path).trim()
  const m = s.match(/^ds\d+\.(.+)$/i)
  return m ? m[1] : s
}

export const ROW_COND_BG_OPS = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'empty',
  'not_empty'
]

const DEFAULT_ROW_COND_BG_COLOR = '#ffe4e4'

export function parseConditionLiteral (raw) {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (s === '') return ''
  const tl = s.toLowerCase()
  if (tl === 'true') return true
  if (tl === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    if (Number.isFinite(n)) return n
  }
  return s
}

function rowFieldIsEmpty (value) {
  if (value == null) return true
  if (typeof value === 'string' && value.trim() === '') return true
  return false
}

function tryFiniteNumberFromCell (value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim())
    if (Number.isFinite(n)) return n
  }
  return null
}

function valuesLooselyEqual (fieldValue, compareParsed) {
  if (compareParsed === true || compareParsed === false) {
    if (fieldValue === compareParsed) return true
    const fs = String(fieldValue).trim().toLowerCase()
    if (compareParsed === true && (fs === 'true' || fs === '1')) return true
    if (compareParsed === false && (fs === 'false' || fs === '0')) return true
    return false
  }
  if (typeof compareParsed === 'number' && Number.isFinite(compareParsed)) {
    const n = tryFiniteNumberFromCell(fieldValue)
    if (n !== null && n === compareParsed) return true
  }
  if (compareParsed === '') {
    return rowFieldIsEmpty(fieldValue)
  }
  return String(fieldValue) === String(compareParsed)
}

function orderedCompareResult (fieldValue, rawCompare) {
  const parsed = parseConditionLiteral(rawCompare)
  const nA = tryFiniteNumberFromCell(fieldValue)
  const nB = typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : tryFiniteNumberFromCell(parsed)
  if (nA !== null && nB !== null) {
    if (nA > nB) return 1
    if (nA < nB) return -1
    return 0
  }
  const a = String(fieldValue ?? '')
  const b = rawCompare == null ? '' : String(rawCompare).trim()
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export function rowValuesMatchForHighlight (fieldValue, op, rawCompareString) {
  const o = op && ROW_COND_BG_OPS.includes(op) ? op : 'eq'
  switch (o) {
    case 'empty':
      return rowFieldIsEmpty(fieldValue)
    case 'not_empty':
      return !rowFieldIsEmpty(fieldValue)
    case 'contains': {
      const needle = rawCompareString == null ? '' : String(rawCompareString)
      if (needle === '') return false
      return String(fieldValue ?? '').includes(needle)
    }
    case 'not_contains': {
      const needle = rawCompareString == null ? '' : String(rawCompareString)
      if (needle === '') return true
      return !String(fieldValue ?? '').includes(needle)
    }
    case 'starts_with': {
      const p = rawCompareString == null ? '' : String(rawCompareString)
      if (p === '') return false
      return String(fieldValue ?? '').startsWith(p)
    }
    case 'ends_with': {
      const s = rawCompareString == null ? '' : String(rawCompareString)
      if (s === '') return false
      return String(fieldValue ?? '').endsWith(s)
    }
    case 'eq':
      return valuesLooselyEqual(fieldValue, parseConditionLiteral(rawCompareString))
    case 'ne':
      return !valuesLooselyEqual(fieldValue, parseConditionLiteral(rawCompareString))
    case 'gt':
      return orderedCompareResult(fieldValue, rawCompareString) > 0
    case 'gte':
      return orderedCompareResult(fieldValue, rawCompareString) >= 0
    case 'lt':
      return orderedCompareResult(fieldValue, rawCompareString) < 0
    case 'lte':
      return orderedCompareResult(fieldValue, rawCompareString) <= 0
    default:
      return valuesLooselyEqual(fieldValue, parseConditionLiteral(rawCompareString))
  }
}

function rowFieldValueForRowCond (rowItem, innerPath) {
  if (rowItem == null || innerPath == null) return undefined
  const inner = String(innerPath).trim()
  if (inner === '') return undefined
  if (typeof rowItem === 'object' && rowItem !== null && !Array.isArray(rowItem)) {
    let v = getRowField(rowItem, inner)
    if (v !== undefined) return v
    const parts = inner.split('.').filter((p) => p !== '')
    const lastKey = parts.length ? parts[parts.length - 1] : inner
    if (lastKey !== '' && Object.prototype.hasOwnProperty.call(rowItem, lastKey)) {
      return rowItem[lastKey]
    }
    return undefined
  }
  if (Array.isArray(rowItem)) return undefined
  return rowItem
}

export function resolveRowCondBackgroundColor (element, rowItem) {
  if (element == null || rowItem == null) return null
  const path = element.rowCondBgPath
  if (typeof path !== 'string' || !path.trim()) return null
  const inner = rowItemFieldPathFromMergeSetting(path.trim())
  if (!inner) return null
  const v = rowFieldValueForRowCond(rowItem, inner)
  const op = typeof element.rowCondBgOp === 'string' ? element.rowCondBgOp : 'eq'
  const rawVal = element.rowCondBgValue
  if (!rowValuesMatchForHighlight(v, op, rawVal)) return null
  const c = element.rowCondBgColor
  if (typeof c === 'string' && c.trim()) return c.trim()
  return DEFAULT_ROW_COND_BG_COLOR
}

export function getFirstPlaceholderToken (content) {
  if (typeof content !== 'string') return null
  const m = content.match(/\$\{([^}]+)\}/)
  return m ? m[1].trim() : null
}

function unwrapPlaceholderPath (token) {
  const t = String(token).trim()
  const rowInner = matchRowIndexInner(t)
  if (rowInner) return rowInner
  const fn = t.match(/^(?:timestamp|count)\(\s*(.+?)\s*\)$/i)
  if (fn) return fn[1].trim()
  return t
}

export function getIterationArrayPath (firstToken, dataset) {
  if (!firstToken) return null
  const t = unwrapPlaceholderPath(firstToken)
  const parts = t.split('.').filter((p) => p !== '')
  if (dataset && parts.length > 0) {
    for (let n = 1; n <= parts.length; n++) {
      const candidate = parts.slice(0, n).join('.')
      const v = parseVariableForReport(dataset, candidate)
      if (Array.isArray(v)) return candidate
    }
  }
  const dsHead = t.match(/^(ds\d+)/i)
  if (dsHead) return dsHead[1].toLowerCase()
  return t
}

export function resolveIterableArrayFromDataset (dataset, path) {
  if (!dataset || path == null || path === '') return null
  const v = parseVariableForReport(dataset, String(path).trim())
  return Array.isArray(v) ? v : null
}

export function formatDateForReport (value, format) {
  if (value === null || value === undefined || value === '') return ''

  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  switch (format) {
    case 'yyyy-MM-dd':
      return `${year}-${month}-${day}`
    case 'yyyy-MM-dd HH:mm:ss':
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    case 'yyyy/MM/dd':
      return `${year}/${month}/${day}`
    case 'yyyy年MM月dd日':
      return `${year}年${month}月${day}日`
    case 'MM/dd/yyyy':
      return `${month}/${day}/${year}`
    case 'dd/MM/yyyy':
      return `${day}/${month}/${year}`
    default:
      return `${year}-${month}-${day}`
  }
}

/**
 * 转为 Unix 网络时间戳（UTC 秒，自 1970-01-01 起）。
 * 已是秒级整数（约 1e9～1e12）原样截断；≥1e12 视为毫秒再除 1000；其余按 Date 可解析值处理。
 * @returns {number|null} 无效时 null
 */
export function toUnixTimestampSeconds (value) {
  if (value === null || value === undefined || value === '') return null
  if (Decimal.isDecimal(value)) {
    if (!value.isFinite()) return null
    return toUnixTimestampSeconds(value.toNumber())
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    const abs = Math.abs(value)
    if (abs >= 1e12) return Math.trunc(value / 1000)
    if (abs >= 1e9) return Math.trunc(value)
    // 小数秒等仍按毫秒 Date 不可靠，走 Date 构造
  }
  if (typeof value === 'string') {
    const t = value.trim()
    if (t === '') return null
    if (/^-?\d+(\.\d+)?$/.test(t)) {
      return toUnixTimestampSeconds(Number(t))
    }
  }
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return null
  return Math.floor(date.getTime() / 1000)
}

/** 与字段占位相同：有 rowItem 时取末段键，否则走 parseDataset */
function resolvePathValue (path, { parseDataset, rowItem }) {
  const token = String(path || '').trim()
  if (!token) return undefined
  if (rowItem !== undefined && rowItem !== null) {
    const parts = token.split('.').filter((p) => p !== '')
    const lastKey = parts.length ? parts[parts.length - 1] : token
    if (typeof rowItem === 'object' && rowItem !== null && !Array.isArray(rowItem)) {
      return rowItem[lastKey]
    }
    return rowItem
  }
  return typeof parseDataset === 'function' ? parseDataset(token) : undefined
}

/**
 * `${timestamp(ds1.print_at)}` → Unix 秒。非 timestamp(...) 返回 null。
 * @returns {number|''|null} 匹配且有效为秒；匹配但空/无效为 ''；不匹配为 null
 */
export function evalTimestampExpression (token, ctx) {
  if (typeof token !== 'string') return null
  const m = token.trim().match(/^timestamp\(\s*(.+?)\s*\)$/i)
  if (!m) return null
  const sec = toUnixTimestampSeconds(resolvePathValue(m[1], ctx || {}))
  return sec == null ? '' : sec
}

const NUMBER_ROUNDING_MODES = {
  half_up: Decimal.ROUND_HALF_UP,
  down: Decimal.ROUND_DOWN,
  up: Decimal.ROUND_UP
}

// 舍入方式:none 无(不舍入) / half_up 四舍五入(默认) / down 舍去(向零截断) / up 进位(远离零)。
// 返回 null 表示不舍入；未知值回退 half_up。
function resolveReportRoundingMode (mode) {
  if (mode === 'none') return null
  const rm = NUMBER_ROUNDING_MODES[mode]
  return rm === undefined ? Decimal.ROUND_HALF_UP : rm
}

/** 按位数舍入；rm 为 null（无）时保持原值，忽略位数。 */
function applyReportDecimalPlaces (d, places, rm) {
  if (rm == null || places == null) return d
  return d.toDecimalPlaces(places, rm)
}

// 小数位数:auto 或空表示跟随数字格式的默认位数;否则取 0 到 10 的整数。
function normalizeReportDecimalPlaces (dp) {
  if (dp === null || dp === undefined || dp === '' || dp === 'auto') return null
  const n = Number(dp)
  if (!Number.isFinite(n)) return null
  const i = Math.trunc(n)
  if (i < 0) return 0
  if (i > 10) return 10
  return i
}

// 千分位分组并拼接前后缀,负号不参与分组。grouping 为 false 时不加千分位。
function formatGroupedFixed (d, places, prefix, suffix, grouping = true) {
  const parts = d.toFixed(places).split('.')
  const neg = parts[0].startsWith('-')
  const digits = neg ? parts[0].slice(1) : parts[0]
  const grouped = grouping ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : digits
  const intPart = (neg ? '-' : '') + grouped
  const decPart = parts.length > 1 ? '.' + parts[1] : ''
  return prefix + intPart + decPart + suffix
}

/**
 * 数字格式化。先按「小数位数」定位数(decimalPlaces 为 auto 时跟随各格式默认位数),
 * 再按「舍入方式」舍入(roundingMode:none 无 / half_up 四舍五入 / down 舍去 / up 进位)。
 * 舍入为 none 时不截位、不进位，按数值原样输出(货币/百分比仍加符号与比例换算)。
 *
 * @param {unknown} value
 * @param {string} format default/integer/currency/percent/fixed2
 * @param {{ decimalPlaces?: number|string, roundingMode?: string, currencySymbol?: string, useGrouping?: boolean }} [options]
 */
export function formatNumberForReport (value, format, options = {}) {
  if (value === null || value === undefined || value === '') return ''

  let d
  if (Decimal.isDecimal(value)) {
    d = value
  } else {
    const parsed = parseReportDecimal(value)
    if (parsed == null) return ''
    d = parsed
  }

  const rm = resolveReportRoundingMode(options.roundingMode)
  const dp = normalizeReportDecimalPlaces(options.decimalPlaces)
  const noRound = rm == null

  // integer / fixed2 / fixed0 是历史「位数预设」,现仅为兼容旧模板保留渲染;
  // 新模板统一用 default 样式 + decimalPlaces 表达位数,见 normalizeLegacyNumberFormat。
  switch (format) {
    case 'integer': {
      if (noRound) return d.toString()
      const places = dp == null ? 0 : dp
      return applyReportDecimalPlaces(d, places, rm).toFixed(places)
    }
    case 'currency': {
      const symbol = typeof options.currencySymbol === 'string' ? options.currencySymbol : '¥'
      const grouping = options.useGrouping !== false
      if (noRound) {
        const places = Math.max(0, d.decimalPlaces())
        return formatGroupedFixed(d, places, symbol, '', grouping)
      }
      const places = dp == null ? 2 : dp
      return formatGroupedFixed(applyReportDecimalPlaces(d, places, rm), places, symbol, '', grouping)
    }
    case 'percent': {
      const pct = d.times(100)
      if (noRound) return pct.toString() + '%'
      const places = dp == null ? 2 : dp
      return applyReportDecimalPlaces(pct, places, rm).toFixed(places) + '%'
    }
    case 'fixed2': {
      if (noRound) return d.toString()
      const places = dp == null ? 2 : dp
      return applyReportDecimalPlaces(d, places, rm).toFixed(places)
    }
    case 'fixed0': {
      if (noRound) return d.toString()
      const places = dp == null ? 0 : dp
      return applyReportDecimalPlaces(d, places, rm).toFixed(places)
    }
    default: {
      if (noRound || dp == null) return d.toString()
      return applyReportDecimalPlaces(d, dp, rm).toFixed(dp)
    }
  }
}

// 历史「位数预设」到正交表示的等价迁移:integer/fixed2/fixed0 一律转为 default 样式,
// 并把位数落到 decimalPlaces(已显式设置的以其为准),迁移前后渲染结果不变。
// 供设计器加载旧模板时规范化,让「样式 × 小数位 × 舍入」三者正交、不再互相覆盖;
// 渲染路径本身仍兼容旧值,不依赖本函数。
export function normalizeLegacyNumberFormat (element) {
  if (!element || typeof element !== 'object') return element
  if (element.formatType !== 'number') return element
  const fmt = element.numberFormat
  if (fmt !== 'integer' && fmt !== 'fixed2' && fmt !== 'fixed0') return element
  const dp = element.decimalPlaces
  const hasExplicitDp = !(dp === null || dp === undefined || dp === '' || dp === 'auto')
  const defaultPlaces = fmt === 'fixed2' ? '2' : '0'
  return {
    ...element,
    numberFormat: 'default',
    decimalPlaces: hasExplicitDp ? dp : defaultPlaces
  }
}

export function applyTextFormat (value, element) {
  if (value === null || value === undefined) return ''
  if (Decimal.isDecimal(value) && !value.isFinite()) return ''
  if (typeof value === 'string' && (value === 'undefined' || value === 'null' || value === 'NaN')) return ''
  if (!element?.formatType || element.formatType === 'none') {
    return stringifyPlaceholderValue(value)
  }
  if (element.formatType === 'date') {
    return formatDateForReport(value, element.dateFormat || 'yyyy-MM-dd')
  }
  if (element.formatType === 'number') {
    return formatNumberForReport(value, element.numberFormat || 'default', {
      decimalPlaces: element.decimalPlaces,
      roundingMode: element.roundingMode,
      currencySymbol: element.currencySymbol,
      useGrouping: element.useGrouping
    })
  }
  return stringifyPlaceholderValue(value)
}

export function evalNowExpression (token) {
  if (typeof token !== 'string') return null
  const t = token.trim()
  if (!t.startsWith('now(') || !t.endsWith(')')) return null
  const inner = t.slice(4, -1).trim()
  const ms = Date.now()
  if (inner === '') {
    return new Date(ms).toISOString()
  }
  const quoted = inner.match(/^(['"])([\s\S]*)\1$/)
  if (quoted) {
    return formatDateForReport(ms, quoted[2])
  }
  return null
}

function stringifyPlaceholderValue (v) {
  if (v === null || v === undefined) return ''
  if (Decimal.isDecimal(v)) return v.toString()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'number' && Number.isNaN(v)) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return ''
    return String(v)
  }
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    return ''
  }
  const s = String(v)
  if (s === 'undefined' || s === 'null' || s === 'NaN' || s === 'Infinity' || s === '-Infinity') return ''
  return s
}

/**
 * 预览/打印：最终写入单元格的文本。仅清空「异常字面量」，**不减删单元格 DOM**（尺寸、边框仍由元素样式控制）。
 */
export function sanitizeReportDisplayedText (v) {
  if (v === null || v === undefined) return ''
  if (Decimal.isDecimal(v)) return v.isFinite() ? v.toString() : ''
  if (typeof v === 'number' && Number.isNaN(v)) return ''
  const s = typeof v === 'string' ? v : String(v)
  const t = s.trim()
  if (t === 'undefined' || t === 'null' || t === 'NaN' || t === 'Infinity' || t === '-Infinity' || t === '[object Object]') {
    return ''
  }
  if (t === '') return ''
  return s
}

/**
 * @param {unknown} rawVal
 * @param {{ formatElement?: Record<string, unknown>, nullishReport?: { seen: boolean } } | Record<string, unknown> | undefined} opts formatElement 兼容旧用法
 */
function formatIfNeeded (rawVal, opts) {
  const formatElement =
    opts && typeof opts === 'object' && 'formatType' in opts && !('formatElement' in opts) && !('nullishReport' in opts)
      ? opts
      : (opts && opts.formatElement) || undefined
  const nullishReport =
    opts && typeof opts === 'object' && 'nullishReport' in opts ? opts.nullishReport : undefined

  if (rawVal === null || rawVal === undefined) {
    if (nullishReport) nullishReport.seen = true
    return ''
  }
  if (Decimal.isDecimal(rawVal) && !rawVal.isFinite()) {
    if (nullishReport) nullishReport.seen = true
    return ''
  }
  if (typeof rawVal === 'number' && Number.isNaN(rawVal)) {
    if (nullishReport) nullishReport.seen = true
    return ''
  }
  if (!formatElement?.formatType || formatElement.formatType === 'none') {
    return stringifyPlaceholderValue(rawVal)
  }
  return applyTextFormat(rawVal, formatElement)
}

/** 占位符内 token 解析为原始值（与 replacePlaceholders 中单次 ${} 逻辑一致） */
function resolvePlaceholderRaw (rawToken, { parseDataset, rowItem, rowIndex }) {
  const token = String(rawToken).trim()

  const nowVal = evalNowExpression(token)
  if (nowVal !== null) return nowVal

  const tsVal = evalTimestampExpression(token, { parseDataset, rowItem })
  if (tsVal !== null) return tsVal

  const countM = token.match(/^count\(\s*(.+?)\s*\)$/)
  if (countM) {
    const path = countM[1].trim()
    const v = parseDataset(path)
    return Array.isArray(v) ? v.length : 0
  }

  if (matchRowIndexInner(token) !== null) {
    if (rowIndex !== undefined && rowIndex !== null && Number.isFinite(Number(rowIndex))) {
      return Number(rowIndex) + 1
    }
    return ''
  }

  return resolvePathValue(token, { parseDataset, rowItem })
}

/**
 * 将占位符/明细列展示值或数据集原始值解析为 Decimal（报表求和/小计/合并段累计/单元格算术）。
 * 支持千分位逗号、前缀货币符号（¥￥$€）、以及「百分比」展示（如 12.34% 对应比值 0.1234）。
 * @param {unknown} value
 * @returns {Decimal|null}
 */
export function parseReportDecimal (value) {
  if (Decimal.isDecimal(value)) {
    return value.isFinite() ? value : null
  }
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    try {
      const d = new Decimal(value)
      return d.isFinite() ? d : null
    } catch {
      return null
    }
  }
  let s = String(value).trim()
  if (s === '' || s === 'undefined' || s === 'null' || s === 'NaN') return null
  s = s.replace(/,/g, '')
  s = s.replace(/^[¥￥$€]+\s*/u, '')
  const isPercentDisplay = /%\s*$/.test(s)
  if (isPercentDisplay) s = s.replace(/%\s*$/, '').trim()
  if (s === '') return null
  try {
    const d = new Decimal(s)
    if (!d.isFinite()) return null
    return isPercentDisplay ? d.div(100) : d
  } catch {
    return null
  }
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function parseReportNumeric (value) {
  const d = parseReportDecimal(value)
  return d == null ? NaN : d.toNumber()
}

function toFiniteDecimal (v) {
  return parseReportDecimal(v)
}

/**
 * sum/subtotal / 合并段累计：Decimal 精确相加。
 * @param {Decimal|number|string|null|undefined} acc
 * @param {Decimal|number|string|null|undefined} delta
 * @returns {Decimal}
 */
export function addReportAggregate (acc, delta) {
  const a = toAggregateDecimal(acc)
  const b = toAggregateDecimal(delta)
  return a.plus(b)
}

function toAggregateDecimal (x) {
  if (x == null) return new Decimal(0)
  if (Decimal.isDecimal(x)) return x
  const d = parseReportDecimal(x)
  return d ?? new Decimal(0)
}

const MAX_REPORT_AGG_EXPR_LEN = 500

/**
 * 从 `${sum(...)}` / `${subtotal(...)}` 括号内表达式取首个 `dsN`，用于与明细迭代路径对齐。
 * @param {string|null|undefined} inner
 * @returns {string|null}
 */
export function extractPrimaryDatasetFromSumInner (inner) {
  if (inner == null) return null
  const m = String(inner).match(/ds\d+/i)
  return m ? m[0].toLowerCase() : null
}

function decimalFromRowDsIdent (ident, rowItem) {
  const path = rowItemFieldPathFromMergeSetting(ident)
  if (!path || rowItem == null || (typeof rowItem === 'object' && rowItem !== null && Array.isArray(rowItem))) {
    return new Decimal(0)
  }
  const raw = getRowField(rowItem, path)
  const d = parseReportDecimal(raw)
  return d ?? new Decimal(0)
}

/**
 * 解析 `${sum(...)}` / `${subtotal(...)}` 括号内算术（仅常数与 `dsN.字段` 引用），不含 eval。
 * 变量：正则 `ds\d+\.[a-zA-Z0-9_.]+`；运算：`+ - * /` 与括号；除数为 0 时该项为 0。
 * @param {string} s 已 trim 的表达式串
 * @param {unknown} rowItem 当前明细行
 * @returns {Decimal}
 */
function evaluateSumInnerExpression (s, rowItem) {
  let i = 0
  const skip = () => {
    while (i < s.length && /\s/.test(s[i])) i++
  }
  const parseExpr = () => {
    let left = parseTerm()
    while (true) {
      skip()
      if (i >= s.length) break
      const op = s[i]
      if (op !== '+' && op !== '-') break
      i++
      const right = parseTerm()
      left = op === '+' ? left.plus(right) : left.minus(right)
    }
    return left
  }
  const parseTerm = () => {
    let left = parseFactor()
    while (true) {
      skip()
      if (i >= s.length) break
      const op = s[i]
      if (op !== '*' && op !== '/') break
      i++
      const right = parseFactor()
      left =
        op === '*' ? left.times(right) : right.isZero() ? new Decimal(0) : left.div(right)
    }
    return left
  }
  const parseFactor = () => {
    skip()
    let sign = 1
    while (i < s.length && (s[i] === '+' || s[i] === '-')) {
      if (s[i] === '-') sign = -sign
      i++
      skip()
    }
    if (i >= s.length) return new Decimal(0)
    if (s[i] === '(') {
      i++
      const v = parseExpr()
      skip()
      if (i >= s.length || s[i] !== ')') return new Decimal(0)
      i++
      return sign < 0 ? v.neg() : v
    }
    if (/\d/.test(s[i])) {
      const start = i
      while (i < s.length && /\d/.test(s[i])) i++
      if (i < s.length && s[i] === '.') {
        i++
        while (i < s.length && /\d/.test(s[i])) i++
      }
      const slice = s.slice(start, i)
      const d = parseReportDecimal(slice) ?? new Decimal(0)
      return sign < 0 ? d.neg() : d
    }
    const rest = s.slice(i)
    const m = rest.match(/^ds\d+\.[a-zA-Z0-9_.]+/i)
    if (m) {
      i += m[0].length
      const d = decimalFromRowDsIdent(m[0], rowItem)
      return sign < 0 ? d.neg() : d
    }
    return new Decimal(0)
  }
  const out = parseExpr()
  skip()
  if (i < s.length) return new Decimal(0)
  return out.isFinite() ? out : new Decimal(0)
}

/**
 * 规范化聚合表达式 key：去除所有空白并转小写。
 * 用于把「合计/小计括号内表达式」与「明细列脱壳后的表达式」对齐匹配（所见即所得口径）。
 * @param {string|null|undefined} s
 * @returns {string}
 */
export function normalizeAggregateExprKey (s) {
  if (s == null) return ''
  return String(s).replace(/\s+/g, '').toLowerCase()
}

/**
 * 把内容里的占位符 ${x} 脱壳为纯表达式 x，便于与合计括号内表达式对齐。
 * 例：${ds1.qty} 得到 ds1.qty；${ds1.qty}*${ds1.price} 得到 ds1.qty*ds1.price。
 * @param {string|null|undefined} content
 * @returns {string}
 */
export function stripPlaceholdersToExpr (content) {
  if (content == null) return ''
  return String(content).replace(/\$\{([^}]*)\}/g, '$1')
}

// 含聚合/函数型占位符（sum/subtotal/count/now/row）的单元格不是「明细数值列」，不纳入显示值映射。
const AGGREGATE_FN_IN_CONTENT_RE = /\$\{\s*(?:sum|subtotal|count|now|row)\s*\(/i

/**
 * 方案一（所见即所得）：由一整行明细单元格构建「脱壳表达式 key 到 该列报表显示值」的映射。
 * 合计/小计按 sum/subtotal 括号内表达式的 key 命中此映射，取明细列显示值参与累加。
 *
 * key   = normalizeAggregateExprKey(stripPlaceholdersToExpr(单元格 content))
 * value = 该单元格在报表上的显示值 parsedContent（已按明细列自身数字格式格式化）
 *
 * 跳过：无占位符的静态单元格、含 sum/subtotal/count/now/row 的非明细数值列。同 key 多列取首个。
 * @param {Array<{ original?: { content?: string }, parsedContent?: unknown }>} cells 同一明细行的单元格
 * @returns {Map<string, unknown>}
 */
export function buildRowDisplayMap (cells) {
  const map = new Map()
  if (!Array.isArray(cells)) return map
  for (const cell of cells) {
    const content = cell && cell.original && cell.original.content
    if (typeof content !== 'string' || content.indexOf('${') === -1) continue
    if (AGGREGATE_FN_IN_CONTENT_RE.test(content)) continue
    const key = normalizeAggregateExprKey(stripPlaceholdersToExpr(content))
    if (!key) continue
    if (!map.has(key)) map.set(key, cell.parsedContent)
  }
  return map
}

/**
 * 方案一回退：当某行找不到对应明细显示列时，按「合计单元格自身数字格式（小数位 + 舍入方式）」
 * 对原始值先舍入，再参与累加。非数字格式或未配置格式时原样返回（不舍入）。
 * @param {Decimal} d
 * @param {Record<string, unknown>|undefined} formatElement 合计单元格 original
 * @returns {Decimal}
 */
function roundDecimalByAggregateFormat (d, formatElement) {
  if (!Decimal.isDecimal(d) || !d.isFinite()) return d
  if (!formatElement || formatElement.formatType !== 'number') return d
  const rm = resolveReportRoundingMode(formatElement.roundingMode)
  if (rm == null) return d
  const dp = normalizeReportDecimalPlaces(formatElement.decimalPlaces)
  const fmt = formatElement.numberFormat || 'default'
  let places
  switch (fmt) {
    case 'integer':
    case 'fixed0':
      places = dp == null ? 0 : dp
      break
    case 'currency':
    case 'fixed2':
      places = dp == null ? 2 : dp
      break
    case 'percent': {
      const p = dp == null ? 2 : dp
      return d.times(100).toDecimalPlaces(p, rm).div(100)
    }
    default:
      places = dp
  }
  if (places == null) return d
  return d.toDecimalPlaces(places, rm)
}

/**
 * 对单明细行求 `${sum(...)}` / `${subtotal(...)}` 括号内表达式的「每行贡献值」。
 * 口径（方案一，所见即所得，合计 = 明细列显示值之和）：
 *   1. 旧写法 `${sum(dsN)}`：取该明细行首单元格显示值 cellDisplayValue；
 *   2. 新写法且能在本行「明细列显示值映射 rowDisplayMap」中按表达式匹配到列：取该明细列在报表上的显示值；
 *   3. 匹配不到：回退按合计单元格自身数字格式（小数位/舍入）对原始值先舍入，再参与累加。
 *
 * @param {string|null|undefined} inner
 * @param {unknown} rowItem
 * @param {{ cellDisplayValue?: unknown, rowDisplayMap?: Map<string, unknown>, aggregateFormat?: Record<string, unknown> }} [options]
 * @returns {Decimal}
 */
export function evaluateReportAggregateExpression (inner, rowItem, options = {}) {
  if (inner == null) return new Decimal(0)
  const s = String(inner).trim()
  if (s.length === 0) return new Decimal(0)
  if (s.length > MAX_REPORT_AGG_EXPR_LEN) return new Decimal(0)
  if (/^ds\d+$/i.test(s)) {
    const d = parseReportDecimal(options.cellDisplayValue)
    return d ?? new Decimal(0)
  }
  const displayMap = options.rowDisplayMap
  if (displayMap && typeof displayMap.get === 'function') {
    const d = parseReportDecimal(displayMap.get(normalizeAggregateExprKey(s)))
    if (d != null) return d
  }
  const raw = evaluateSumInnerExpression(s, rowItem)
  return roundDecimalByAggregateFormat(raw, options.aggregateFormat)
}

function formatArithmeticDecimalResult (d) {
  if (!d.isFinite()) return ''
  if (d.isInteger()) return d.toString()
  return d.toDecimalPlaces(10).toString()
}

/** 所有 ${...} 区间 [start, end)，end 为占位符切片末尾后一位 */
function getPlaceholderRanges (s) {
  const ranges = []
  let pos = 0
  while (pos < s.length) {
    const a = s.indexOf('${', pos)
    if (a === -1) break
    const b = s.indexOf('}', a + 2)
    if (b === -1) break
    ranges.push([a, b + 1])
    pos = b + 1
  }
  return ranges
}

function isInsidePlaceholder (ranges, index) {
  return ranges.some(([lo, hi]) => index >= lo && index < hi)
}

function skipSpacesForward (s, i) {
  let k = i
  while (k < s.length && /\s/.test(s[k])) k++
  return k
}

function skipSpacesBackward (s, i) {
  let k = i
  while (k >= 0 && /\s/.test(s[k])) k--
  return k
}

/** 去掉可选的一元 ± 后是否为 ${...} */
function operandHasVariable (text) {
  const t = String(text).trim()
  const rest = t.replace(/^[+-]\s*/, '')
  return /^\$\{[^}]+\}$/.test(rest)
}

/**
 * 左侧运算元：结束于 opIndex 之前（不含运算符），支持小数、一元 ±、${}
 */
function parseLeftOperand (s, opIndex) {
  let j = skipSpacesBackward(s, opIndex - 1)
  if (j < 0) return null
  const endExclusive = j + 1

  if (s[j] === '}') {
    const phStart = s.lastIndexOf('${', j)
    if (phStart === -1 || phStart > j) return null
    return { start: phStart, end: endExclusive }
  }

  let k = j
  while (k >= 0 && /\d/.test(s[k])) k--
  if (k >= 0 && s[k] === '.') {
    k--
    while (k >= 0 && /\d/.test(s[k])) k--
  }
  let numStart = k + 1
  k = numStart - 1
  k = skipSpacesBackward(s, k)
  if (k >= 0 && (s[k] === '-' || s[k] === '+')) {
    let p = skipSpacesBackward(s, k - 1)
    if (p < 0 || '+-*/'.includes(s[p])) {
      numStart = k
    }
  }
  if (numStart > j) return null
  return { start: numStart, end: endExclusive }
}

/**
 * 右侧运算元：从 opIndex 之后开始，支持 -${}、+数字、小数
 */
function parseRightOperand (s, opIndex) {
  let i = skipSpacesForward(s, opIndex + 1)
  if (i >= s.length) return null
  let start = i

  if (s[i] === '-' || s[i] === '+') {
    let k = skipSpacesForward(s, i + 1)
    if (k < s.length && (s[k] === '$' && s[k + 1] === '{' || /\d/.test(s[k]))) {
      start = i
      i = k
    }
  }

  if (s[i] === '$' && s[i + 1] === '{') {
    const close = s.indexOf('}', i + 2)
    if (close === -1) return null
    return { start, end: close + 1 }
  }

  if (/\d/.test(s[i])) {
    let end = i
    while (end < s.length && /\d/.test(s[end])) end++
    if (end < s.length && s[end] === '.') {
      end++
      while (end < s.length && /\d/.test(s[end])) end++
    }
    return { start, end }
  }

  return null
}

function resolveOperand (text, options) {
  let t = String(text).trim()
  let sign = 1
  if (t.length >= 2 && (t[0] === '-' || t[0] === '+')) {
    const rest = t.slice(1).trim()
    if (rest.startsWith('${') || (rest.length > 0 && /\d/.test(rest[0]))) {
      if (t[0] === '-') sign = -1
      t = rest
    }
  }
  if (t.startsWith('${') && t.endsWith('}')) {
    const inner = t.slice(2, -1).trim()
    const raw = resolvePlaceholderRaw(inner, options)
    return { hasVar: true, raw, sign }
  }
  const lit = toFiniteDecimal(t)
  if (lit == null) return null
  return { hasVar: false, n: sign < 0 ? lit.neg() : lit }
}

function numericDecimalValue (resolved) {
  if (!resolved) return null
  if (resolved.hasVar) {
    const d = parseReportDecimal(resolved.raw)
    if (d == null) return null
    return resolved.sign < 0 ? d.neg() : d
  }
  return resolved.n
}

function expandOperandToString (text, options) {
  const r = resolveOperand(text, options)
  if (!r) return String(text).trim()
  if (r.hasVar) {
    const prefix = r.sign < 0 ? '-' : ''
    const formatted = formatIfNeeded(r.raw, options)
    return prefix + formatted
  }
  return r.n.toString()
}

function findFirstBinaryExpr (s, ranges, ops) {
  for (let i = 0; i < s.length; i++) {
    if (isInsidePlaceholder(ranges, i)) continue
    const op = s[i]
    if (!ops.includes(op)) continue

    const left = parseLeftOperand(s, i)
    const right = parseRightOperand(s, i)
    if (!left || !right) continue

    const leftText = s.slice(left.start, left.end)
    const rightText = s.slice(right.start, right.end)
    if (!operandHasVariable(leftText) && !operandHasVariable(rightText)) continue

    return {
      start: left.start,
      end: right.end,
      op,
      leftText,
      rightText
    }
  }
  return null
}

function applyBinary (s, m, options) {
  const lRes = resolveOperand(m.leftText, options)
  const rRes = resolveOperand(m.rightText, options)
  if (!lRes || !rRes) return s

  const dl = numericDecimalValue(lRes)
  const dr = numericDecimalValue(rRes)

  if (dl != null && dr != null) {
    let out
    switch (m.op) {
      case '+':
        out = dl.plus(dr)
        break
      case '-':
        out = dl.minus(dr)
        break
      case '*':
        out = dl.times(dr)
        break
      case '/':
        out = dr.isZero() ? null : dl.div(dr)
        break
      default:
        return s
    }
    if (out != null && out.isFinite()) {
      return s.slice(0, m.start) + formatArithmeticDecimalResult(out) + s.slice(m.end)
    }
  }

  const sl = expandOperandToString(m.leftText, options)
  const sr = expandOperandToString(m.rightText, options)
  return s.slice(0, m.start) + sl + m.op + sr + s.slice(m.end)
}

/**
 * 先扫描运算符（不在 ${} 内），再解析左右运算元（小数、一元 ±、占位符）；
 * 仅当至少一侧含 ${} 且解析变量后两侧均为有限数字时才做数值运算，否则只做占位符展开并保留运算符。
 */
function evaluateTemplateArithmetic (content, options) {
  if (typeof content !== 'string' || !/[+\-*/]/.test(content)) return content

  let s = content
  let guard = 0
  const maxPasses = 64
  while (guard++ < maxPasses) {
    const ranges = getPlaceholderRanges(s)
    const mulDiv = findFirstBinaryExpr(s, ranges, '*/')
    if (mulDiv) {
      s = applyBinary(s, mulDiv, options)
      continue
    }
    const addSub = findFirstBinaryExpr(s, ranges, '+-')
    if (!addSub) break
    s = applyBinary(s, addSub, options)
  }
  return s
}

/**
 * 替换 ${...}：支持 now()、timestamp(路径)、count(路径)、row(路径) 明细序号、数据集路径；
 * 可选 rowItem 按「路径最后一段」取行字段；可选 rowIndex（0 起）时序号为 rowIndex+1。
 * 若传入 formatElement 且设置了 formatType，**仅对每个 ${...} 的取值**套用日期/数字格式，前缀等静态文本不参与格式化。
 * timestamp(...) 输出 Unix 秒字符串，不再套元素上的日期/数字格式。
 *
 * @param {string} content
 * @param {{ parseDataset: (path: string) => unknown, rowItem?: unknown, rowIndex?: number, formatElement?: Record<string, unknown>, nullishReport?: { seen: boolean } }} options
 */
export function replacePlaceholders (content, { parseDataset, rowItem, rowIndex, formatElement, nullishReport } = {}) {
  if (typeof content !== 'string') return content

  const options = { parseDataset, rowItem, rowIndex, formatElement, nullishReport }
  const afterArith = evaluateTemplateArithmetic(content, options)

  return afterArith.replace(PLACEHOLDER_RE, (match, raw) => {
    const token = String(raw).trim()

    const nowVal = evalNowExpression(token)
    if (nowVal !== null) return formatIfNeeded(nowVal, options)

    const tsVal = evalTimestampExpression(token, options)
    if (tsVal !== null) return tsVal === '' ? '' : String(tsVal)

    const countM = token.match(/^count\(\s*(.+?)\s*\)$/)
    if (countM) {
      const path = countM[1].trim()
      const v = parseDataset(path)
      const len = Array.isArray(v) ? v.length : 0
      return formatIfNeeded(len, options)
    }

    if (matchRowIndexInner(token) !== null) {
      if (rowIndex !== undefined && rowIndex !== null && Number.isFinite(Number(rowIndex))) {
        return formatIfNeeded(Number(rowIndex) + 1, options)
      }
      return ''
    }

    return formatIfNeeded(resolvePathValue(token, options), options)
  })
}

/**
 * Designer canvas sample: resolve ${ds1.field} / ${param.x} against the first
 * dataset row (and param values). Unresolved placeholders become ''.
 */
export function resolveDesignerSampleContent (content, dataset, param) {
  if (typeof content !== 'string' || content.indexOf('${') < 0) return content
  const ds = dataset && typeof dataset === 'object' && !Array.isArray(dataset) ? dataset : {}
  const pm = param && typeof param === 'object' && !Array.isArray(param) ? param : {}
  const scope = { ...ds, param: pm }
  return replacePlaceholders(content, {
    parseDataset: (path) => parseVariableForReport(scope, path)
  })
}

export { Decimal }
