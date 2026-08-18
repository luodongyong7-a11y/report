import { describe, expect, it } from 'vitest'
import {
  RFID_MARKS,
  describeSavedMark,
  findRfidMark,
  isLabelMarkTemplate,
  isWorkspaceOriginTemplate,
  withDesignerOrigin,
  withWorkspaceOrigin,
  suggestMarkId,
  walmartHangtag83x25,
  walmartSticker50x35,
  targetTicket4x4,
  homeDepotGs1_4x6,
  walmartCartonItf14,
  walmartShip4x6,
  targetCarton4x6,
  homeDepotUpcSticker,
  walmartUpcSticker,
  whitmorUpcSticker,
  whitmorCartonItf14,
  whitmorShip4x6
} from './index.js'

describe('RFID 唛头 JSON', () => {
  it('includes Walmart 83×25 hangtag and 50×35 sticker', () => {
    const ids = RFID_MARKS.map((m) => m.id)
    expect(ids).toContain('walmart-rfid-83x25')
    expect(ids).toContain('walmart-rfid-50x35')
    expect(ids).toContain('target-ticket-4x4')
    expect(ids).toContain('homedepot-gs1-4x6')
    expect(ids).toContain('walmart-carton-itf14')
    expect(ids).toContain('walmart-ship-4x6')
    expect(ids).toContain('target-carton-4x6')
    expect(ids).toContain('homedepot-upc-sticker')
    expect(ids).toContain('walmart-upc-sticker')
    expect(ids).toContain('whitmor-upc-sticker')
    expect(ids).toContain('whitmor-carton-itf14')
    expect(ids).toContain('whitmor-ship-4x6')
    expect(findRfidMark('walmart-rfid-83x25').sizeMm).toEqual({ width: 83, height: 25 })
    expect(findRfidMark('walmart-rfid-50x35').sizeMm).toEqual({ width: 50, height: 35 })
  })

  it('does not auto-pick a Walmart size when both hangtag and sticker exist', () => {
    expect(suggestMarkId('Walmart-United States America')).toBe('')
    expect(suggestMarkId('TARGET')).toBe('')
    expect(suggestMarkId('Homedepot')).toBe('')
    expect(suggestMarkId('Whitmor')).toBe('')
  })

  it('hangtag is 83×25 with UPC + EPC, sticker is 50×35 with barcode', () => {
    const hang = walmartHangtag83x25()
    expect(hang.customPaperSizeMm).toEqual({ width: 83, height: 25 })
    expect(hang.elements.map((e) => e.content)).toEqual(['${ds1.UPC}', 'EPC'])
    const sticker = walmartSticker50x35()
    expect(sticker.customPaperSizeMm).toEqual({ width: 50, height: 35 })
    expect(sticker.elements.some((e) => e.type === 'barcode')).toBe(true)
    expect(sticker.elements.some((e) => e.content === '${ds1.DESC}')).toBe(true)
  })

  it('Target ticket keeps DPCI / PO / UPC placeholders from TG-211', () => {
    const ticket = targetTicket4x4()
    expect(ticket.customPaperSizeMm).toEqual({ width: 101.6, height: 101.6 })
    const text = ticket.elements.map((e) => e.content).join(' ')
    expect(text).toContain('${ds1.DPCI}')
    expect(text).toContain('${ds1.PO}')
    expect(ticket.elements.some((e) => e.type === 'barcode' && e.content === '${ds1.UPC}')).toBe(true)
  })

  it('Home Depot 4×6 is SSCC and Walmart carton is ITF-14', () => {
    const hd = homeDepotGs1_4x6()
    expect(hd.customPaperSizeMm).toEqual({ width: 101.6, height: 152.4 })
    expect(hd.rfidMark).toBe(false)
    expect(hd.elements.some((e) => e.barcodeFormat === 'sscc' && e.content === '${ds1.SSCC}')).toBe(true)
    expect(hd.elements.some((e) => e.barcodeFormat === 'gs1-128')).toBe(false)
    const carton = walmartCartonItf14()
    expect(carton.customPaperSizeMm).toEqual({ width: 101.6, height: 76.2 })
    expect(carton.rfidMark).toBe(false)
    expect(carton.elements.some((e) => e.barcodeFormat === 'itf14' && e.content === '${ds1.ITF14}')).toBe(true)
    expect(walmartShip4x6().elements.some((e) => e.barcodeFormat === 'sscc')).toBe(true)
    expect(targetCarton4x6().elements.some((e) => e.content === 'DPCI: ${ds1.DPCI}')).toBe(true)
    expect(homeDepotUpcSticker().elements.some((e) => e.barcodeFormat === 'upca' && e.barcodeFont === 'OCR-B')).toBe(true)
    expect(walmartUpcSticker().elements.some((e) => e.barcodeFormat === 'upca')).toBe(true)
    expect(whitmorUpcSticker().rfidMark).toBe(false)
    expect(whitmorUpcSticker().elements.some((e) => e.barcodeFormat === 'upca')).toBe(true)
    expect(whitmorCartonItf14().elements.some((e) => e.barcodeFormat === 'itf14' && e.content === '${ds1.ITF14}')).toBe(true)
    expect(whitmorShip4x6().elements.some((e) => e.barcodeFormat === 'sscc')).toBe(true)
  })

  it('describes a user-saved copy without treating it as a builtin overwrite target', () => {
    const sticker = walmartSticker50x35()
    const saved = { ...sticker, id: 'wm-50-shelf', name: '货架 50×35', markCustomer: 'Walmart' }
    const d = describeSavedMark('wm-50-shelf', saved)
    expect(d.title).toBe('货架 50×35')
    expect(d.customer).toBe('Walmart')
    expect(d.sizeMm).toEqual({ width: 50, height: 35 })
    expect(isLabelMarkTemplate(saved)).toBe(true)
    expect(isLabelMarkTemplate({ printKind: 'document' })).toBe(false)
    expect(findRfidMark('wm-50-shelf')).toBeNull()
    expect(d.origin).toBe('designer')
    expect(isWorkspaceOriginTemplate(saved)).toBe(false)
    const extra = withWorkspaceOrigin(saved, 'job-1')
    expect(isWorkspaceOriginTemplate(extra)).toBe(true)
    expect(extra.workspaceJobId).toBe('job-1')
    expect(describeSavedMark('wm-50-shelf', extra).origin).toBe('workspace')
    expect(isWorkspaceOriginTemplate(withDesignerOrigin(extra))).toBe(false)
  })
})
