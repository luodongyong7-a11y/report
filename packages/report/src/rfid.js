/**
 * Shared RFID / EPC helpers for print-data jobs and label templates.
 * ZPL emit (^RFW) lives in the sidecar; this module only builds the payload.
 */
import { parseVariableForReport, replacePlaceholders } from './expressions.js'

export function createRfidConfig () {
  return {
    enabled: false,
    expression: '${prefix}${PO}${seq}',
    prefix: '',
    seqStart: 1,
    seqPad: 0,
    seqScope: 'line',
    writeFormat: 'hex'
  }
}

export function padSeq (n, width) {
  const s = String(n)
  const w = Math.max(0, Number(width) || 0)
  if (!w) return s
  return s.padStart(w, '0')
}

export function evaluateRfid (rfid, row, key, seqText) {
  const prefix = String(rfid.prefix || '')
  const ctx = {
    prefix,
    seq: seqText,
    PO: key,
    ...(row && typeof row === 'object' ? row : {})
  }
  let expr = String(rfid.expression || '').trim()
  if (!expr) expr = '${prefix}${PO}${seq}'
  if (!expr.includes('${') && expr.includes('{')) {
    expr = expr.replace(/\{([A-Za-z0-9_]+)\}/g, '${$1}')
  }
  const raw = replacePlaceholders(expr, {
    parseDataset: (path) => parseVariableForReport(ctx, path),
    rowItem: ctx
  })
  const payload = String(raw ?? '')
  if (rfid.writeFormat === 'ascii') return payload
  return toEpcHex(payload)
}

export function toEpcHex (payload) {
  const s = String(payload || '').replace(/\s+/g, '')
  if (!s) return ''
  if (/^[0-9A-Fa-f]+$/.test(s) && s.length % 2 === 0) return s.toUpperCase()
  let hex = ''
  const buf = typeof Buffer !== 'undefined'
    ? Buffer.from(s, 'utf8')
    : new TextEncoder().encode(s)
  for (const b of buf) hex += Number(b).toString(16).toUpperCase().padStart(2, '0')
  return hex
}

export function assertRfidHex (hex) {
  const s = String(hex || '').trim()
  if (!s) return
  if (!/^[0-9A-F]+$/.test(s) || s.length % 2 !== 0) {
    throw new Error(`RFID EPC must be even-length hex, got: ${s}`)
  }
}

function pageRowItem (page) {
  if (page && page.rowItem && typeof page.rowItem === 'object') return page.rowItem
  const rows = page && page.rows
  if (Array.isArray(rows) && rows[0] && rows[0].rowItem && typeof rows[0].rowItem === 'object') {
    return rows[0].rowItem
  }
  return {}
}

function rowKey (row) {
  if (!row || typeof row !== 'object') return ''
  if (row.PO != null && String(row.PO).trim()) return String(row.PO).trim()
  if (row.po != null && String(row.po).trim()) return String(row.po).trim()
  if (row._key != null && String(row._key).trim()) return String(row._key).trim()
  return ''
}

/**
 * Stamp `page.epc` from template.rfid (label templates, one page per dataset row).
 * Does not overwrite a non-empty epc already set by the print job.
 */
export function attachTemplateRfid (pages, templateData) {
  const rfid = templateData && templateData.rfid
  if (!rfid || !rfid.enabled) return pages
  if (templateData && templateData.printKind && templateData.printKind !== 'label') {
    return pages
  }
  const seqStart = Number.isFinite(Number(rfid.seqStart)) ? Number(rfid.seqStart) : 1
  const list = Array.isArray(pages) ? pages : []
  for (let i = 0; i < list.length; i++) {
    const page = list[i]
    if (!page || page.epc) continue
    const row = pageRowItem(page)
    const seqNum = rfid.seqScope === 'order' ? seqStart + i : seqStart
    const seq = padSeq(seqNum, rfid.seqPad)
    page.epc = evaluateRfid(rfid, row, rowKey(row), seq)
  }
  return list
}
