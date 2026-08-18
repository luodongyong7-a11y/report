import { describe, it, expect } from 'vitest'
import { resolveDesignerSampleContent } from './expressions.js'
import { aliasDatasetRows } from './printJob.js'

describe('resolveDesignerSampleContent', () => {
  it('uses the first designer dataset row for ${ds1.field}', () => {
    const dataset = {
      ds1: {
        type: 'EXCEL',
        data: [
          { UPC: '012345678905', DESC: 'first' },
          { UPC: '999999999999', DESC: 'second' }
        ]
      }
    }
    expect(resolveDesignerSampleContent('${ds1.UPC}', dataset, {})).toBe('012345678905')
    expect(resolveDesignerSampleContent('SKU-${ds1.DESC}', dataset, {})).toBe('SKU-first')
  })

  it('resolves ${param.x} from param values', () => {
    expect(resolveDesignerSampleContent('${param.prefix}${ds1.PO}', {
      ds1: { type: 'EXCEL', data: [{ PO: '12345' }] }
    }, { prefix: 'WM' })).toBe('WM12345')
  })

  it('resolves RFID placeholders after retail aliases on an order-sheet row', () => {
    const dataset = aliasDatasetRows({
      ds1: {
        type: 'EXCEL',
        data: [{ '客户 ITEM': '002-05-6309', PO: '10001931753', 物料名称: '铁线鞋架' }]
      }
    }, { key: '客户 ITEM' })
    expect(resolveDesignerSampleContent('DPCI: ${ds1.DPCI}', dataset, {})).toBe('DPCI: 002-05-6309')
    expect(resolveDesignerSampleContent('${ds1.PO}', dataset, {})).toBe('10001931753')
    expect(resolveDesignerSampleContent('${ds1.DESC}', dataset, {})).toBe('铁线鞋架')
    expect(resolveDesignerSampleContent('${ds1.UPC}', dataset, {})).toBe('')
  })

  it('keeps a real UPC column as UPC-A payload', () => {
    const dataset = aliasDatasetRows({
      ds1: {
        type: 'EXCEL',
        data: [{ '客户 ITEM': '002-11-0485', UPC: '191908755830', PO: '10001931753' }]
      }
    }, { key: '客户 ITEM' })
    expect(resolveDesignerSampleContent('${ds1.DPCI}', dataset, {})).toBe('002-11-0485')
    expect(resolveDesignerSampleContent('${ds1.UPC}', dataset, {})).toBe('191908755830')
  })

  it('leaves static content unchanged and empty data as empty string', () => {
    expect(resolveDesignerSampleContent('012345678905', {}, {})).toBe('012345678905')
    expect(resolveDesignerSampleContent('${ds1.UPC}', {
      ds1: { type: 'EXCEL', data: [] }
    }, {})).toBe('')
  })
})
