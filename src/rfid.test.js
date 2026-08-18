import { describe, expect, it } from 'vitest'
import {
  attachTemplateRfid,
  createRfidConfig,
  evaluateRfid,
  padSeq,
  toEpcHex
} from './rfid.js'

describe('rfid helpers', () => {
  it('builds even-length hex EPC from prefix+PO+seq', () => {
    const hex = evaluateRfid(
      { enabled: true, prefix: 'X', expression: '${prefix}${PO}${seq}', seqPad: 3, writeFormat: 'hex' },
      { PO: 'A' },
      'A',
      '001'
    )
    expect(hex).toBe(toEpcHex('XA001'))
    expect(hex).toMatch(/^[0-9A-F]+$/)
    expect(hex.length % 2).toBe(0)
  })

  it('pads sequence numbers', () => {
    expect(padSeq(7, 3)).toBe('007')
    expect(padSeq(7, 0)).toBe('7')
  })

  it('stamps one EPC per label page; order scope increments', () => {
    const pages = [
      { rowItem: { PO: 'A' } },
      { rowItem: { PO: 'B' } }
    ]
    const rfid = {
      ...createRfidConfig(),
      enabled: true,
      prefix: 'X',
      seqPad: 3,
      seqScope: 'order'
    }
    attachTemplateRfid(pages, { printKind: 'label', rfid })
    expect(pages[0].epc).toBe(toEpcHex('XA001'))
    expect(pages[1].epc).toBe(toEpcHex('XB002'))
  })

  it('does not overwrite an epc already set by the print job', () => {
    const pages = [{ rowItem: { PO: 'A' }, epc: 'DEAD' }]
    attachTemplateRfid(pages, {
      printKind: 'label',
      rfid: { ...createRfidConfig(), enabled: true, prefix: 'X' }
    })
    expect(pages[0].epc).toBe('DEAD')
  })
})
