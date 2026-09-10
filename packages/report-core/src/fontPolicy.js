// 报表字体策略：单一事实源（SSOT）。
// 设计器画布、浏览器预览、边车 PDF 三条链路共用同一份字体/行高/内边距口径，
// 边车经 report-pdf/engine/font-policy.mjs 以相对路径桥接复用本文件（同 reportExpressions 的零拷贝范式），
// 杜绝两端各自硬编码导致字体回退、行高、分页各走各的。
//
// 约束：本文件必须框架无关、零依赖，可被 Vite（前端）与 Node（边车）同时 import。
// 不得引入 Vue、i18n、@ 别名或任何浏览器/Node 专有 API。

export const REPORT_DEFAULT_FONT_SIZE_PX = 12

// 文本内边距(px)：设计器 / PDF / HTML 同源。过小贴边难看，过大易与 Excel 错位；当前取 1。
export const REPORT_TEXT_PADDING_PX = 1

export const REPORT_MEDIA_PADDING_PX = 3

// 中文/符号兜底：只落到边车同源的 SimSun（及 Windows 别名「宋体」）与 Segoe UI Symbol，
// 禁止雅黑/sans-serif 等漂移字体。
export const REPORT_CJK_FALLBACK = 'SimSun, "宋体", "Segoe UI Symbol"'

// 默认字体栈：与边车 PDF/HTML 预览同一口径（Times + SimSun + Segoe UI Symbol），
// 不含雅黑等无同源文件的字体，避免「设计器一套、预览另一套」。
export const REPORT_DEFAULT_FONT_FAMILY =
  '"Times New Roman", SimSun, "宋体", "Segoe UI Symbol"'

// 字体白名单：仅保留「边车有同源字体文件（times/simsun/simhei）+ 浏览器本地可得」的确定性字体，
// 根除「设了不算」。value 为空串表示自动（用默认栈）；labelKey 走前端 i18n，缺省用 value 作显示名。
export const REPORT_FONT_WHITELIST = [
  { value: '', labelKey: 'designer.toolbar.fontAuto' },
  { value: 'SimSun', labelKey: 'designer.toolbar.fontSimSun' },
  { value: 'SimHei', labelKey: 'designer.toolbar.fontSimHei' },
  { value: 'Times New Roman' }
]

function quoteFamily (name) {
  const v = String(name).trim()
  if (v.startsWith('"') || v.startsWith("'")) return v
  return /\s/.test(v) ? `"${v}"` : v
}

// 把元素的 fontFamily 解析成「带中文兜底」的完整字体栈（设计器画布、内联编辑、浏览器预览共用）。
// 空 → 默认栈；已是字体栈（含逗号）→ 原样尊重；单值 → 追加中文兜底链。
export function resolveReportFontFamily (fontFamily) {
  const v = (fontFamily == null ? '' : String(fontFamily)).trim()
  if (v === '') return REPORT_DEFAULT_FONT_FAMILY
  if (v.includes(',')) return v
  return `${quoteFamily(v)}, ${REPORT_CJK_FALLBACK}`
}

// 把元素的 fontFamily 映射成边车主字体 key（times/song/hei），决定西文与中文各用哪款内置字体：
//  - times：西文走 Times、中文走 SimSun（默认，等价历史行为）
//  - song ：西文与中文都走 SimSun（选「宋体」时浏览器西文亦用 SimSun，对齐）
//  - hei  ：西文与中文都走 SimHei（选「黑体」时）
// 仅识别白名单内确定性字体；其余（含空、雅黑、楷体等无同源文件者）落 times（西文）、中文仍走 song。
export function fontKeyForFamily (fontFamily) {
  const v = (fontFamily == null ? '' : String(fontFamily)).trim().toLowerCase()
  if (v === '') return 'times'
  if (v.includes('simhei') || v.includes('黑体')) return 'hei'
  if (v.includes('simsun') || v.includes('宋')) return 'song'
  if (v.includes('times')) return 'times'
  return 'times'
}
