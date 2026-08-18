/**
 * Ingest slot: delimited text → column mapping → print-job rows.
 * No X12 / EDIFACT dialect parsers yet; register them on EDI_PARSERS later.
 */

export const EDI_PARSER_DELIMITED = 'delimited'

export const EDI_PARSERS = {
  [EDI_PARSER_DELIMITED]: parseDelimitedText
}

const DELIMS = ['\t', ',', '|', '*', ';']

export function guessDelimiter (line) {
  const s = String(line || '')
  let best = ','
  let bestN = -1
  for (const d of DELIMS) {
    const n = s.split(d).length
    if (n > bestN) {
      bestN = n
      best = d
    }
  }
  return bestN > 1 ? best : ','
}

function looksLikeHeaderCell (cell) {
  const s = String(cell || '').trim()
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)
}

export function parseDelimitedText (text, delimiter) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.length > 0)
  const delim = delimiter || guessDelimiter(lines[0] || '')
  const rows = lines.map((line) => line.split(delim).map((c) => String(c).trim()))
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0)
  const hasHeader = rows.length > 0 && rows[0].every(looksLikeHeaderCell)
  const headers = hasHeader
    ? rows[0].map((h, i) => h || `col${i + 1}`)
    : Array.from({ length: colCount }, (_, i) => `col${i + 1}`)
  return {
    kind: EDI_PARSER_DELIMITED,
    delimiter: delim,
    hasHeader,
    headers,
    rows,
    colCount
  }
}

export function parseIngest (fileName, text, opts = {}) {
  const name = String(fileName || '').toLowerCase()
  if (/\.(xlsx|xls)$/.test(name)) {
    throw new Error('xlsx ingest is not supported here')
  }
  const parser = EDI_PARSERS[opts.parser || EDI_PARSER_DELIMITED]
  if (typeof parser !== 'function') {
    throw new Error(`unknown ingest parser: ${opts.parser}`)
  }
  return parser(text, opts.delimiter)
}

export function defaultIngestMapping (parsed) {
  const headers = (parsed && parsed.headers) || []
  return headers.map((column, source) => ({ column, source }))
}

export function applyIngestMapping (parsed, mapping) {
  if (!parsed || !Array.isArray(parsed.rows)) return []
  const start = parsed.hasHeader ? 1 : 0
  const body = parsed.rows.slice(start)
  const maps = Array.isArray(mapping) && mapping.length ? mapping : defaultIngestMapping(parsed)
  return body.map((cells) => {
    const row = {}
    for (const m of maps) {
      const col = String((m && m.column) || '').trim()
      if (!col) continue
      const idx = Number(m.source)
      row[col] = Number.isFinite(idx) && cells[idx] != null ? String(cells[idx]).trim() : ''
    }
    return row
  })
}
