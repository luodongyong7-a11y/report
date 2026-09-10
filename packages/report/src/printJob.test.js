import { describe, expect, it } from 'vitest'
import {
  applyItemTemplates,
  assignTemplateToCustomerItem,
  assignTemplateToRows,
  excelDatasetFromRows,
  mergeRowsIntoTemplateDataset,
  rowsFromDataset,
  bindJobRowsToLabelTemplate,
  chargeForPrint,
  copiesForRow,
  createPrintJob,
  customerItemKey,
  evaluateRfid,
  expandPrintItems,
  extractDigitsFromLines,
  extractKeyFromLines,
  extractMatchCandidates,
  findMatchingTemplateId,
  guessFields,
  gtinBodyKeys,
  injectExpandedRows,
  jobCanPrintWithoutPdf,
  keyFromFileName,
  linePrintStatus,
  listCustomerItemGroups,
  matchPagesToRows,
  matchTemplatesToRows,
  printLayoutOf,
  nextPrintState,
  normalizeKey,
  retailAliasFields,
  aliasDatasetRows,
  previewDatasetPayload,
  withoutInventedRetailTitles,
  importedFieldNames,
  upcPayloadKey,
  applyPdfSourceTemplates,
  sourcePdfFileNameForRow,
  resolveTemplateId,
  toEpcHex
} from './printJob.js'
import { expandElements } from './layout/expand.js'

function jobWithRows () {
  const job = createPrintJob('SO-1')
  job.fields = { key: 'PO', qty: 'QTY', packQty: 'PACK' }
  job.rows = [
    { PO: 'A', QTY: 2, PACK: 1 },
    { PO: 'B', QTY: 0, PACK: 1 },
    { PO: 'C', QTY: 3, PACK: 1 }
  ]
  job.match.box = { x: 0, y: 0, width: 100, height: 40 }
  job.match.pageText = true
  job.matchResult = matchPagesToRows(job, [
    { fileName: 'p.pdf', pageIndex: 0, pageHeightPt: 72, textLines: [{ content: 'A', xPt: 10, yTopPt: 10, wPt: 20, hPt: 12 }] },
    { fileName: 'p.pdf', pageIndex: 1, pageHeightPt: 72, textLines: [{ content: 'B', xPt: 10, yTopPt: 10, wPt: 20, hPt: 12 }] },
    { fileName: 'p.pdf', pageIndex: 2, pageHeightPt: 72, textLines: [{ content: 'C', xPt: 10, yTopPt: 10, wPt: 20, hPt: 12 }] }
  ])
  return job
}

describe('printJob copies', () => {
  it('uses qty or floor qty/pack', () => {
    expect(copiesForRow({ QTY: 10 }, { qty: 'QTY' }, { mode: 'qty' })).toBe(10)
    expect(copiesForRow({ QTY: 10, PACK: 4 }, { qty: 'QTY', packQty: 'PACK' }, { mode: 'qtyOverPack' })).toBe(2)
    expect(copiesForRow({ QTY: 0 }, { qty: 'QTY' }, { mode: 'qty' })).toBe(0)
    expect(copiesForRow({ 总箱数: 499, 订单数量: 2994, 装箱数: 6 }, { qty: '订单数量', packQty: '装箱数', cartonQty: '总箱数' }, { mode: 'carton' })).toBe(499)
    expect(copiesForRow({ 订单数量: 2994, 装箱数: 6 }, { qty: '订单数量', packQty: '装箱数' }, { mode: 'carton' })).toBe(499)
  })
})

describe('guessFields order sheet', () => {
  const row = {
    订单号: 'SO-1',
    客户名称: 'Walmart-United States America',
    物料编码: 'M1',
    物料名称: 'shelf',
    ITEM: 'MS89-635-008-01V',
    PO: '51151529',
    订单数量: 100,
    装箱数: 4,
    总箱数: 25,
    '客户 ITEM': '677746090',
    客户PO: '51151529'
  }

  it('prefers 客户 ITEM over PO, and keeps factory ITEM / 总箱数 / 客户名称', () => {
    const g = guessFields([row])
    expect(g.key).toBe('客户 ITEM')
    expect(g.item).toBe('ITEM')
    expect(g.customer).toBe('客户名称')
    expect(g.qty).toBe('订单数量')
    expect(g.packQty).toBe('装箱数')
    expect(g.cartonQty).toBe('总箱数')
  })
})

describe('bind by customer+ITEM', () => {
  it('same ITEM across POs shares one 唛头', () => {
    const job = createPrintJob('WM')
    job.layout = 'template'
    job.fields = { key: '客户 ITEM', qty: '订单数量', customer: '客户名称', item: 'ITEM' }
    job.rows = [
      { 客户名称: 'Walmart-United States America', ITEM: 'MS89-635-008-01V', PO: 'A', 订单数量: 1, '客户 ITEM': '677746090' },
      { 客户名称: 'Walmart-United States America', ITEM: 'MS89-635-008-01V', PO: 'B', 订单数量: 1, '客户 ITEM': '677746090' },
      { 客户名称: 'TARGET', ITEM: 'TG-205AV', PO: 'C', 订单数量: 1, '客户 ITEM': '002-05-6309' }
    ]
    expect(customerItemKey(job.rows[0], job.fields)).toBe(customerItemKey(job.rows[1], job.fields))
    expect(listCustomerItemGroups(job)).toHaveLength(2)
    assignTemplateToCustomerItem(job, customerItemKey(job.rows[0], job.fields), 'walmart-rfid-50x35')
    applyItemTemplates(job)
    expect(resolveTemplateId(job, 0)).toBe('walmart-rfid-50x35')
    expect(resolveTemplateId(job, 1)).toBe('walmart-rfid-50x35')
    expect(resolveTemplateId(job, 2)).toBe('')
  })

  it('assigns a mark to selected row indexes', () => {
    const job = createPrintJob('X')
    job.layout = 'template'
    job.rows = [{ A: 1 }, { A: 2 }, { A: 3 }]
    assignTemplateToRows(job, [0, 2], 'mark-a')
    expect(resolveTemplateId(job, 0)).toBe('mark-a')
    expect(resolveTemplateId(job, 1)).toBe('')
    expect(resolveTemplateId(job, 2)).toBe('mark-a')
    expect(job.templateId).toBe('')
    assignTemplateToRows(job, [1], 'mark-a')
    expect(resolveTemplateId(job, 1)).toBe('mark-a')
    expect(job.templateId).toBe('mark-a')
  })

  it('writes imported rows onto a new mark dataset and reads them back', () => {
    const rows = [{ PO: 'A', 订单数量: 2 }, { PO: 'B', 订单数量: 3 }]
    const ds = excelDatasetFromRows(rows, { name: '批次1' })
    expect(ds.ds1.type).toBe('EXCEL')
    expect(ds.ds1.fields).toEqual(['PO', '订单数量'])
    expect(ds.ds1.data).toEqual(rows)
    const tpl = mergeRowsIntoTemplateDataset({ datasetVar: 'ds1', dataset: { ds1: { type: 'EXCEL', data: [] } } }, rows)
    expect(tpl.dataset.ds1.data).toEqual(rows)
    expect(rowsFromDataset(tpl.dataset)).toEqual(rows)
  })

  it('aliases 客户 ITEM onto DPCI for Target JSON', () => {
    const aliased = retailAliasFields(
      { '客户 ITEM': '002-05-6309', PO: '51151529', 物料名称: 'rack' },
      { key: '客户 ITEM' }
    )
    expect(aliased.DPCI).toBe('002-05-6309')
    expect(aliased.PO).toBe('51151529')
    expect(aliased.DESC).toBe('rack')
  })

  it('does not keep invented SKU / QTY / GS1128 titles on imported rows', () => {
    const raw = {
      客户名称: 'TARGET',
      ITEM: 'TG-205AV',
      PO: '10001975194',
      订单数量: 10,
      装箱数: 5,
      物料名称: '铁线鞋架',
      '客户 ITEM': '002-05-6309'
    }
    const polluted = retailAliasFields(raw, { key: '客户 ITEM', item: 'ITEM', customer: '客户名称' })
    expect(polluted.SKU).toBe('002-05-6309')
    expect(polluted.QTY).toBe(5)
    expect(polluted.GS1128).toBeTruthy()
    const cleaned = withoutInventedRetailTitles(polluted)
    expect(cleaned.SKU).toBeUndefined()
    expect(cleaned.QTY).toBeUndefined()
    expect(cleaned.GS1128).toBeUndefined()
    expect(cleaned.DPCI).toBeUndefined()
    expect(cleaned['客户 ITEM']).toBe('002-05-6309')
    expect(cleaned.PO).toBe('10001975194')
    expect(cleaned.装箱数).toBe(5)
    expect(importedFieldNames([polluted])).toEqual(Object.keys(cleaned))
    const rebound = retailAliasFields(cleaned, { key: '客户 ITEM', item: 'ITEM', customer: '客户名称' })
    expect(rebound.DPCI).toBe('002-05-6309')
    expect(rebound.QTY).toBe(5)
  })

  it('aliases 商品条码 onto UPC and never treats Target PO as UPC', () => {
    const withCode = retailAliasFields({
      '客户 ITEM': '002-05-6309',
      PO: '10001975194',
      商品条码: '191908755830'
    }, { key: '客户 ITEM' })
    expect(withCode.UPC).toBe('191908755830')
    expect(withCode.PO).toBe('10001975194')
    const noCode = retailAliasFields({
      '客户 ITEM': '002-05-6309',
      PO: '10001975194'
    }, { key: '客户 ITEM' })
    expect(noCode.UPC).toBeFalsy()
  })

  it('aliases the factory order sheet onto RFID placeholders', () => {
    const row = {
      客户名称: 'TARGET',
      ITEM: 'TG-205AV',
      PO: '10001931753',
      订单数量: 2994,
      物料名称: '铁线鞋架',
      '客户 ITEM': '002-05-6309',
      客户PO: ''
    }
    const aliased = retailAliasFields(row, { key: '客户 ITEM', item: 'ITEM', customer: '客户名称' })
    expect(aliased.DPCI).toBe('002-05-6309')
    expect(aliased.PO).toBe('10001931753')
    expect(aliased.ITEM).toBe('TG-205AV')
    expect(aliased.DESC).toBe('铁线鞋架')
    expect(aliased.CUSTOMER).toBe('TARGET')
    expect(aliased.UPC).toBeFalsy()
    const ds = aliasDatasetRows({ ds1: { type: 'EXCEL', data: [row] } }, { key: '客户 ITEM' })
    expect(ds.ds1.data[0].DPCI).toBe('002-05-6309')
    expect(previewDatasetPayload({ ds1: { type: 'EXCEL', data: [row] } }).ds1[0].DPCI).toBe('002-05-6309')
  })

  it('builds Home Depot GS1-128 and Walmart ITF-14 aliases from the order sheet', () => {
    const hd = retailAliasFields({
      客户名称: 'Homedepot',
      ITEM: 'EH-WSTHDUS-538V',
      '客户 ITEM': '1005994173',
      PO: 'HD-9001',
      装箱数: 25,
      UPC: '191908755830'
    })
    expect(hd.SKU).toBe('1005994173')
    expect(hd.QTY).toBe(25)
    expect(hd.ITF14).toBe('00191908755830')
    expect(hd.GS1128).toContain('(01)00191908755830')
    expect(hd.GS1128).toContain('(400)HD-9001')
    expect(hd.GS1128).toContain('(37)25')
    const withSscc = retailAliasFields({
      客户名称: 'Homedepot',
      ITEM: 'EH-WSTHDUS-538V',
      '客户 ITEM': '1005994173',
      PO: 'HD-9001',
      装箱数: 25,
      UPC: '191908755830',
      SSCC: '00012345678901234567'
    })
    expect(withSscc.SSCC).toBe('00012345678901234567')
    expect(withSscc.GS1128).toContain('(01)00191908755830')
    expect(withSscc.GS1128).not.toContain('(00)')
  })
})

describe('printJob match', () => {
  it('matches page text to PO and skips zero copies', () => {
    const job = jobWithRows()
    const matched = job.matchResult.filter((m) => m.status === 'matched')
    expect(matched.map((m) => m.key).sort()).toEqual(['A', 'C'])
    expect(job.matchResult.find((m) => m.key === 'B').status).toBe('zeroCopies')
  })

  it('parses PO from filename pattern', () => {
    expect(keyFromFileName('A.pdf', '{PO}.pdf', 'PO')).toBe('A')
    expect(keyFromFileName('label-C-v1.pdf', 'label-{PO}-v1.pdf', 'PO')).toBe('C')
  })

  it('extracts intersecting glyphs', () => {
    const key = extractKeyFromLines(
      [{ content: 'HELLO', xPt: 10, yTopPt: 10, wPt: 40, hPt: 12 }],
      { x: 5, y: 5, width: 80, height: 30 },
      72
    )
    expect(key).toBe('HELLO')
    expect(normalizeKey('  A  B ')).toBe('A B')
  })

  it('treats UPC-A 11-digit Excel values as the 12-digit HRI with check digit', () => {
    expect(upcPayloadKey('19190875583')).toBe('19190875583')
    expect(upcPayloadKey('191908755830')).toBe('19190875583')
    expect(upcPayloadKey('0191908755830')).toBe('19190875583')
    expect(upcPayloadKey('PO99')).toBe('')
    const job = createPrintJob('upc')
    job.fields = { key: 'UPC', qty: 'QTY' }
    job.rows = [{ UPC: '19190875583', QTY: 2 }]
    job.match.box = { x: 0, y: 0, width: 400, height: 400 }
    job.match.pageText = true
    const result = matchPagesToRows(job, [{
      fileName: 'upc.pdf',
      pageIndex: 0,
      pageHeightPt: 72,
      textLines: [{ content: '191908755830', xPt: 10, yTopPt: 10, wPt: 80, hPt: 12 }]
    }])
    expect(result[0].status).toBe('matched')
    expect(result[0].rowIndex).toBe(0)
  })

  it('reads UPC-A HRI left-to-right when side digits sit higher than the body', () => {
    const box = { x: 0, y: 0, width: 400, height: 400 }
    const textLines = [
      { content: '1', xPt: 10, yTopPt: 8, wPt: 6, hPt: 10 },
      { content: '0', xPt: 120, yTopPt: 8, wPt: 6, hPt: 10 },
      { content: '9190875583', xPt: 20, yTopPt: 40, wPt: 90, hPt: 10 }
    ]
    expect(extractKeyFromLines(textLines, box, 72)).toBe('109190875583')
    expect(extractDigitsFromLines(textLines, box, 72)).toBe('191908755830')
    expect(extractMatchCandidates({ textLines, pageHeightPt: 72 }, box)).toContain('191908755830')
    const job = createPrintJob('upc-hri')
    job.fields = { key: 'UPC', qty: 'QTY' }
    job.rows = [{ UPC: '19190875583', QTY: 1 }]
    job.match.box = box
    job.match.pageText = true
    const result = matchPagesToRows(job, [{
      fileName: 'upc.pdf',
      pageIndex: 0,
      pageHeightPt: 72,
      textLines
    }])
    expect(result[0].status).toBe('matched')
    expect(result[0].key).toBe('191908755830')
  })

  it('keeps PO text matching when a barcode is also on the page', () => {
    const job = createPrintJob('po')
    job.fields = { key: 'PO', qty: 'QTY' }
    job.rows = [{ PO: 'PO99', QTY: 3 }]
    job.match.box = { x: 0, y: 0, width: 80, height: 40 }
    job.match.pageText = true
    const result = matchPagesToRows(job, [{
      fileName: 'p.pdf',
      pageIndex: 0,
      pageHeightPt: 72,
      textLines: [
        { content: 'PO99', xPt: 10, yTopPt: 10, wPt: 30, hPt: 12 },
        { content: '191908755830', xPt: 10, yTopPt: 50, wPt: 80, hPt: 12 }
      ]
    }])
    expect(result[0].status).toBe('matched')
    expect(result[0].key).toBe('PO99')
  })

  it('matches UPC-A even when the Excel check digit is missing or wrong', () => {
    const job = createPrintJob('upc-check')
    job.fields = { key: 'UPC', qty: 'QTY' }
    job.rows = [{ UPC: '191908755831', QTY: 1 }]
    job.match.box = { x: 0, y: 0, width: 400, height: 400 }
    job.match.pageText = true
    const result = matchPagesToRows(job, [{
      fileName: 'upc.pdf',
      pageIndex: 0,
      pageHeightPt: 72,
      textLines: [{ content: '19190875583', xPt: 10, yTopPt: 10, wPt: 80, hPt: 12 }]
    }])
    expect(result[0].status).toBe('matched')
  })

  it('matches EAN-13 / EAN-8 / ITF-14 / UPC-E when the check digit is missing', () => {
    const cases = [
      { field: '590123412345', page: '5901234123457', name: 'ean13' },
      { field: '9638507', page: '96385074', name: 'ean8' },
      { field: '1540014128876', page: '15400141288763', name: 'itf14' },
      { field: '123456', page: '01234565', name: 'upce' }
    ]
    for (const c of cases) {
      const job = createPrintJob(c.name)
      job.fields = { key: 'UPC', qty: 'QTY' }
      job.rows = [{ UPC: c.field, QTY: 1 }]
      job.match.box = { x: 0, y: 0, width: 400, height: 400 }
      job.match.pageText = true
      const result = matchPagesToRows(job, [{
        fileName: `${c.name}.pdf`,
        pageIndex: 0,
        pageHeightPt: 72,
        textLines: [{ content: c.page, xPt: 10, yTopPt: 10, wPt: 90, hPt: 12 }]
      }])
      expect(result[0].status, c.name).toBe('matched')
    }
    const ean13 = [...gtinBodyKeys('590123412345')]
    const ean13Full = [...gtinBodyKeys('5901234123457')]
    expect(ean13.some((k) => ean13Full.includes(k))).toBe(true)
  })

  it('matches a GS1 (01) GTIN to ITF-14 digits', () => {
    const job = createPrintJob('gs1')
    job.fields = { key: 'GTIN', qty: 'QTY' }
    job.rows = [{ GTIN: '(01)15400141288763', QTY: 1 }]
    job.match.box = { x: 0, y: 0, width: 400, height: 400 }
    job.match.pageText = true
    const result = matchPagesToRows(job, [{
      fileName: 'gs1.pdf',
      pageIndex: 0,
      pageHeightPt: 72,
      textLines: [{ content: '15400141288763', xPt: 10, yTopPt: 10, wPt: 90, hPt: 12 }]
    }])
    expect(result[0].status).toBe('matched')
  })
})

describe('printJob expand + rfid', () => {
  it('sample is one page per selected line; production uses copies', () => {
    const job = jobWithRows()
    expect(expandPrintItems(job, 'sample', null)).toHaveLength(2)
    expect(expandPrintItems(job, 'production', null)).toHaveLength(5)
    expect(expandPrintItems(job, 'production', [0])).toHaveLength(2)
  })

  it('template layout expands rows without PDF match', () => {
    const job = createPrintJob('T')
    job.layout = 'template'
    job.templateId = 'generic'
    job.fields = { key: 'PO', qty: 'QTY' }
    job.rows = [{ PO: 'A', QTY: 2 }, { PO: 'B', QTY: 1 }]
    expect(expandPrintItems(job, 'production', null)).toHaveLength(3)
    expect(expandPrintItems(job, 'production', null)[0].templateId).toBe('generic')
    job.rowTemplates = { 1: 'sku-b' }
    const items = expandPrintItems(job, 'sample', [0, 1])
    expect(items.map((i) => i.templateId)).toEqual(['generic', 'sku-b'])
  })

  it('specified template wins over generic; auto-match fills the rest', () => {
    const job = createPrintJob('T')
    job.layout = 'template'
    job.templateId = 'generic'
    job.fields = { key: 'PO', qty: 'QTY', template: 'TPL' }
    job.rows = [
      { PO: '51151529', QTY: 1, TPL: '' },
      { PO: 'B', QTY: 1, TPL: 'TG-211 0485' },
      { PO: 'C', QTY: 1, TPL: '' }
    ]
    job.rowTemplates = { 0: 'line-a' }
    expect(resolveTemplateId(job, 0)).toBe('line-a')
    expect(resolveTemplateId(job, 1)).toBe('generic')
    expect(findMatchingTemplateId(['TG-211 0485', 'other'], 'TG-211_0485__2_.pdf')).toBe('TG-211 0485')
    job.rowTemplates = matchTemplatesToRows(job, ['TG-211 0485', 'line-a'])
    expect(job.rowTemplates['0']).toBe('line-a')
    expect(job.rowTemplates['1']).toBe('TG-211 0485')
    expect(resolveTemplateId(job, 2)).toBe('generic')
    expect(linePrintStatus(job, 2)).toBe('matched')
    job.templateId = ''
    job.rowTemplates = { 0: 'line-a' }
    expect(linePrintStatus(job, 2)).toBe('noTemplate')
    expect(expandPrintItems(job, 'sample', [2])).toHaveLength(0)
  })

  it('one imported PDF becomes the JSON for every line; several PDFs match by box text', () => {
    const job = createPrintJob('T')
    job.layout = 'template'
    job.fields = { key: 'PO', qty: 'QTY' }
    job.rows = [{ PO: 'A', QTY: 1 }, { PO: 'B', QTY: 1 }, { PO: 'C', QTY: 1 }]
    job.sourcePdfs = [{ fileName: 'sku-a.pdf' }]
    job.pdfTemplates = { 'sku-a.pdf': 'sku-a' }
    applyPdfSourceTemplates(job)
    expect(job.templateId).toBe('sku-a')
    expect(resolveTemplateId(job, 0)).toBe('sku-a')
    expect(resolveTemplateId(job, 2)).toBe('sku-a')
    expect(sourcePdfFileNameForRow(job, 1)).toBe('sku-a.pdf')
    expect(job.genericPdf).toBe('sku-a.pdf')

    job.sourcePdfs = [{ fileName: 'sku-a.pdf' }, { fileName: 'sku-b.pdf' }]
    job.pdfTemplates = { 'sku-a.pdf': 'sku-a', 'sku-b.pdf': 'sku-b' }
    job.genericPdf = ''
    job.match.box = { x: 0, y: 0, width: 100, height: 40 }
    job.matchResult = matchPagesToRows(job, [
      { fileName: 'sku-a.pdf', pageIndex: 0, pageHeightPt: 72, textLines: [{ content: 'A', xPt: 10, yTopPt: 10, wPt: 20, hPt: 12 }] },
      { fileName: 'sku-b.pdf', pageIndex: 0, pageHeightPt: 72, textLines: [{ content: 'B', xPt: 10, yTopPt: 10, wPt: 20, hPt: 12 }] }
    ])
    applyPdfSourceTemplates(job)
    expect(job.templateId).toBe('')
    expect(resolveTemplateId(job, 0)).toBe('sku-a')
    expect(resolveTemplateId(job, 1)).toBe('sku-b')
    expect(resolveTemplateId(job, 2)).toBe('')
    expect(linePrintStatus(job, 2)).toBe('noTemplate')
    expect(sourcePdfFileNameForRow(job, 0)).toBe('sku-a.pdf')
    expect(expandPrintItems(job, 'sample', [0, 1, 2])).toHaveLength(2)

    job.genericPdf = 'sku-a.pdf'
    applyPdfSourceTemplates(job)
    expect(job.templateId).toBe('sku-a')
    expect(resolveTemplateId(job, 2)).toBe('sku-a')
    expect(linePrintStatus(job, 2)).toBe('matched')
    expect(sourcePdfFileNameForRow(job, 2)).toBe('sku-a.pdf')
    expect(expandPrintItems(job, 'sample', [0, 1, 2])).toHaveLength(3)
  })

  it('injects expanded rows into a label dataset', () => {
    const job = createPrintJob('T')
    job.layout = 'template'
    job.templateId = 'generic'
    job.fields = { key: 'PO', qty: 'QTY' }
    job.rows = [{ PO: 'A', QTY: 2 }]
    const items = expandPrintItems(job, 'production', null)
    const filled = injectExpandedRows({ dataset: { ds1: { type: 'EXCEL', data: [] } } }, items, 'ds1')
    expect(filled.dataset.ds1.data).toHaveLength(2)
    expect(filled.dataset.ds1.data[0].PO).toBe('A')
  })

  it('binds static PDF-import fields to job rows so each line is its own page', () => {
    const job = createPrintJob('T')
    job.layout = 'template'
    job.templateId = 'generic'
    job.fields = { key: 'PO', qty: 'QTY' }
    job.rows = [
      { PO: '51151529', QTY: 1 },
      { PO: '51151527', QTY: 1 }
    ]
    const items = expandPrintItems(job, 'sample', [0, 1])
    const filled = bindJobRowsToLabelTemplate({
      printKind: 'label',
      dataset: {},
      paperSize: { width: 384, height: 384 },
      elements: [
        { id: 'po', type: 'text', x: 18, width: 62.68, height: 30, content: 'PO#:', style: { fontSize: '20px' } },
        {
          id: 'bc',
          type: 'barcode',
          x: 40,
          y: 60,
          width: 300,
          height: 220,
          content: '191908755830',
          barcodeFormat: 'upca',
          barcodeRenderer: 'adobe-upc',
          barcodeInkContent: '191908755830',
          barcodeDisplayValue: true
        }
      ]
    }, items, '', { fields: job.fields })
    expect(filled.elements[0].content).toContain('${ds1.PO}')
    expect(filled.elements[0].width).toBeGreaterThan(120)
    expect(filled.elements[1].content).toBe('191908755830')
    expect(filled.elements[1].barcodeFormat).toBe('upca')
    const { renderedElements } = expandElements(filled)
    const texts = renderedElements.filter((e) => e.original.id === 'po').map((e) => e.parsedContent)
    const codes = renderedElements.filter((e) => e.original.id === 'bc').map((e) => e.parsedContent)
    expect(texts).toEqual(['PO#: 51151529', 'PO#: 51151527'])
    expect(codes).toEqual(['191908755830', '191908755830'])
  })

  it('binds PDF labels to whatever columns the Excel actually has', () => {
    const job = createPrintJob('T')
    job.layout = 'template'
    job.templateId = 'generic'
    job.fields = { key: 'Style', qty: 'Qty' }
    job.rows = [{ Style: 'TG-211', Qty: 12, Color: 'Navy', Size: 'M' }]
    const items = expandPrintItems(job, 'sample', [0])
    const filled = bindJobRowsToLabelTemplate({
      printKind: 'label',
      dataset: {},
      paperSize: { width: 384, height: 384 },
      elements: [
        { id: 'style', type: 'text', content: 'STYLE:', style: { fontSize: '14px' } },
        { id: 'color', type: 'text', content: 'Color', style: { fontSize: '14px' } },
        { id: 'size', type: 'text', content: 'SIZE: M', style: { fontSize: '14px' } },
        { id: 'made', type: 'text', content: 'MADE IN USA', style: { fontSize: '14px' } }
      ]
    }, items)
    expect(filled.elements[0].content).toBe('STYLE: ${ds1.Style}')
    expect(filled.elements[1].content).toBe('${ds1.Color}')
    expect(filled.elements[2].content).toBe('SIZE: ${ds1.Size}')
    expect(filled.elements[3].content).toBe('MADE IN USA')
    const rows = Array.isArray(filled.dataset.ds1) ? filled.dataset.ds1 : filled.dataset.ds1.data
    expect(rows[0].Color).toBe('Navy')
    expect(rows[0].Size).toBe('M')
    expect(rows[0].Style).toBe('TG-211')
  })

  it('binds a barcode widget to a UPC column when the row has one', () => {
    const job = createPrintJob('T')
    job.layout = 'template'
    job.templateId = 'generic'
    job.fields = { key: 'PO', qty: 'QTY' }
    job.rows = [{ PO: 'A', QTY: 1, UPC: '012345678905' }]
    const items = expandPrintItems(job, 'sample', [0])
    const filled = bindJobRowsToLabelTemplate({
      printKind: 'label',
      dataset: {},
      paperSize: { width: 384, height: 384 },
      elements: [
        { id: 'bc', type: 'barcode', content: '191908755830', barcodeFormat: 'upca' }
      ]
    }, items, '', { fields: job.fields })
    expect(filled.elements[0].content).toBe('${ds1.UPC}')
  })

  it('fills Target ticket placeholders from the factory order sheet', () => {
    const job = createPrintJob('T')
    job.layout = 'template'
    job.templateId = 'target-ticket-4x4'
    job.fields = { key: '客户 ITEM', qty: '订单数量', customer: '客户名称', item: 'ITEM' }
    job.rows = [{
      客户名称: 'TARGET',
      ITEM: 'TG-205AV',
      PO: '10001931753',
      订单数量: 2994,
      物料名称: '铁线鞋架',
      '客户 ITEM': '002-05-6309'
    }]
    const items = expandPrintItems(job, 'sample', [0])
    const filled = bindJobRowsToLabelTemplate({
      printKind: 'label',
      dataset: { ds1: { type: 'EXCEL', data: [] } },
      paperSize: { width: 384, height: 384 },
      elements: [
        { id: 'dpci', type: 'text', content: 'DPCI: ${ds1.DPCI}' },
        { id: 'upc', type: 'barcode', content: '${ds1.UPC}', barcodeFormat: 'upca' },
        { id: 'po', type: 'text', content: 'PO#: ${ds1.PO}' }
      ]
    }, items, '', { fields: job.fields })
    expect(filled.elements[0].content).toBe('DPCI: ${ds1.DPCI}')
    expect(filled.elements[1].content).toBe('${ds1.UPC}')
    expect(filled.elements[1].barcodeFormat).toBe('upca')
    expect(filled.elements[2].content).toBe('PO#: ${ds1.PO}')
    const { renderedElements } = expandElements(filled)
    expect(renderedElements.find((e) => e.original.id === 'dpci').parsedContent).toBe('DPCI: 002-05-6309')
    expect(renderedElements.find((e) => e.original.id === 'upc').parsedContent).toBe('')
    expect(renderedElements.find((e) => e.original.id === 'po').parsedContent).toBe('PO#: 10001931753')
  })

  it('overlay is raster: unmatched rows cannot print without a PDF', () => {
    const job = createPrintJob('OV')
    job.layout = 'overlay'
    job.templateId = 'TG-211 0485'
    job.fields = { key: 'PO', qty: 'QTY' }
    job.rows = [
      { PO: '51151529', QTY: 1 },
      { PO: '51151527', QTY: 1 }
    ]
    job.matchResult = [
      { status: 'matched', rowIndex: 0, pageRef: { fileName: 'a.pdf', pageIndex: 0 }, key: '51151529', copies: 1 },
      { status: 'unmatchedRow', rowIndex: 1, pageRef: null, key: '51151527', copies: 1 }
    ]
    expect(printLayoutOf(job)).toBe('raster')
    expect(jobCanPrintWithoutPdf(job)).toBe(false)
    expect(linePrintStatus(job, 0)).toBe('matched')
    expect(linePrintStatus(job, 1)).toBe('unmatchedRow')
    expect(expandPrintItems(job, 'sample', [1])).toHaveLength(0)
  })

  it('builds hex EPC from prefix+PO+seq', () => {
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
})

describe('printJob billing', () => {
  it('first sample of each line is free; second sample bills 1', () => {
    const job = jobWithRows()
    const first = chargeForPrint(job, 'sample', null)
    expect(first.physicalPages).toBe(2)
    expect(first.chargePages).toBe(0)
    job.printState = nextPrintState(job, 'sample', null)
    const second = chargeForPrint(job, 'sample', [0])
    expect(second.physicalPages).toBe(1)
    expect(second.chargePages).toBe(1)
  })

  it('production bills once per line then reprints are free', () => {
    const job = jobWithRows()
    const first = chargeForPrint(job, 'production', [0])
    expect(first.physicalPages).toBe(2)
    expect(first.chargePages).toBe(2)
    job.printState = nextPrintState(job, 'production', [0])
    const reprint = chargeForPrint(job, 'production', [0])
    expect(reprint.physicalPages).toBe(2)
    expect(reprint.chargePages).toBe(0)
    const other = chargeForPrint(job, 'production', [2])
    expect(other.chargePages).toBe(3)
  })
})
