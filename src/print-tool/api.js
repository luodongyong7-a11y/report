// 禁止: /report/dataset/excel-parse、/report/zpl
export const REPORT_TEMPLATE_API_BASE = '/report/mode'
export const REPORT_SQL_API_BASE = '/report/sql'
export const REPORT_SQL_PARSE = '/report/sql/parse'
export const REPORT_SQL_SCHEMA = '/report/sql/schema'
export const REPORT_DATASET_API_FETCH = '/report/dataset/api-fetch'
export const REPORT_PDF = '/report/pdf'
export const REPORT_PDF_PREVIEW = '/report/pdf/preview'
export const REPORT_HTML_PREVIEW = '/report/html/preview'
export const REPORT_XLSX = '/report/xlsx'
export const REPORT_LICENSE = '/report/license'
export const REPORT_PRINT_AGENT_DOWNLOAD = '/report/print-agent/download'
export const REPORT_PRINT_AGENT_INFO = '/report/print-agent/info'
export const PRINT_MODE_PREVIEW = 'preview'
export const PRINT_MODE_NORMAL = 'normal'
export const PRINT_MODE_MANAGE = 'manage'

export function joinApi (base, path) {
  const b = String(base || '').replace(/\/+$/, '')
  const p = String(path || '')
  if (!b) return p
  if (p.startsWith(b)) return p
  if (p.startsWith('/')) return b.replace(/\/report$/, '') + p
  return b + '/' + p
}

export function templateItemUrl (templateApi, fileName) {
  const url = String(templateApi || REPORT_TEMPLATE_API_BASE).replace(/\/+$/, '')
  return url + '/' + encodeURIComponent(fileName)
}

export function withStamp (url) {
  const u = String(url || '')
  return u + (u.includes('?') ? '&' : '?') + '_t=' + Date.now()
}
