import { describe, expect, it } from 'vitest'
import {
  applyIngestMapping,
  defaultIngestMapping,
  parseDelimitedText,
  parseIngest
} from './ediMap.js'

describe('edi ingest mapping', () => {
  it('parses headered CSV into rows via mapping', () => {
    const parsed = parseIngest('po.csv', 'PO,QTY\nA,2\nB,3')
    expect(parsed.hasHeader).toBe(true)
    expect(parsed.headers).toEqual(['PO', 'QTY'])
    const rows = applyIngestMapping(parsed, defaultIngestMapping(parsed))
    expect(rows).toEqual([
      { PO: 'A', QTY: '2' },
      { PO: 'B', QTY: '3' }
    ])
  })

  it('guesses pipe delimiter and maps by index', () => {
    const parsed = parseDelimitedText('A|10\nB|20')
    expect(parsed.delimiter).toBe('|')
    expect(parsed.hasHeader).toBe(false)
    const rows = applyIngestMapping(parsed, [
      { column: 'PO', source: 0 },
      { column: 'QTY', source: 1 }
    ])
    expect(rows[0]).toEqual({ PO: 'A', QTY: '10' })
  })
})
