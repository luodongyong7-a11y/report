/**
 * Default RFID 唛头 JSON (first-run seed only). Users edit copies in the designer;
 * print-data must not overwrite a saved template.
 * Placeholders: ds1.DPCI / PO / UPC / DESC / COO.
 */
import { mmToPx, pxToMm } from '../barcodeGrade.js'

function roundPx (mm) {
  return Math.round(mmToPx(mm))
}

function labelPaper (widthMm, heightMm, opts = {}) {
  const width = roundPx(widthMm)
  const height = roundPx(heightMm)
  return {
    schemaVersion: 1,
    paperSize: { width, height },
    paperPreset: 'CUSTOM',
    paperOrientation: width >= height ? 'landscape' : 'portrait',
    customPaperSize: { width, height },
    customPaperSizeMm: { width: widthMm, height: heightMm },
    printKind: 'label',
    rfidMark: opts.rfid !== false,
    headerY: height,
    footerY: height,
    headerHeight: height,
    footerHeight: 0,
    summaryEnabled: false,
    summaryA: null,
    summaryB: null,
    datasetVar: 'ds1',
    dataset: { ds1: { type: 'EXCEL', data: [] } }
  }
}

function textStyle (fontSize, fontWeight = 'normal', extra = {}) {
  return {
    fontFamily: 'Arial',
    fontSize: `${fontSize}px`,
    fontWeight,
    fontStyle: 'normal',
    color: extra.color || '#000000',
    backgroundColor: extra.bg || 'transparent'
  }
}

function textEl (id, spec) {
  return {
    id,
    type: 'text',
    x: spec.x,
    y: spec.y,
    width: spec.w,
    height: spec.h,
    content: spec.content,
    textAlign: spec.align || 'left',
    verticalAlign: spec.valign || 'middle',
    tolerateNullish: true,
    prevNodeId: null,
    style: textStyle(spec.size || 12, spec.weight || 'normal', { color: spec.color, bg: spec.bg })
  }
}

function barcodeEl (id, spec) {
  return {
    id,
    type: 'barcode',
    x: spec.x,
    y: spec.y,
    width: spec.w,
    height: spec.h,
    content: spec.content || '${ds1.UPC}',
    barcodeFormat: spec.format || 'upca',
    barcodeFit: 'element',
    barcodeDisplayValue: spec.displayValue !== false,
    barcodeFont: spec.font || 'Arial',
    prevNodeId: null,
    style: { backgroundColor: 'transparent' }
  }
}

/** Walmart generic hangtag: 83×25 mm, 4 mm gutter, HRI UPC + EPC badge. */
export function walmartHangtag83x25 () {
  const widthMm = 83
  const heightMm = 25
  const paper = labelPaper(widthMm, heightMm)
  const g = roundPx(4)
  const w = paper.paperSize.width
  const h = paper.paperSize.height
  const epcW = roundPx(18)
  const epcH = h - g * 2
  return {
    ...paper,
    id: 'walmart-rfid-83x25',
    name: 'Walmart RFID 83×25',
    markCustomer: 'Walmart',
    markKind: 'hangtag',
    elements: [
      textEl('upc', {
        x: g,
        y: g,
        w: w - g * 3 - epcW,
        h: h - g * 2,
        content: '${ds1.UPC}',
        size: 20,
        weight: 'bold'
      }),
      textEl('epc', {
        x: w - g - epcW,
        y: g,
        w: epcW,
        h: epcH,
        content: 'EPC',
        size: 16,
        weight: 'bold',
        align: 'center',
        color: '#ffffff',
        bg: '#000000'
      })
    ]
  }
}

/** Walmart EPC combo sticker: 50×35 mm. UPC bars on top, EPC badge + desc below. */
export function walmartSticker50x35 () {
  const widthMm = 50
  const heightMm = 35
  const paper = labelPaper(widthMm, heightMm)
  const g = roundPx(2.2)
  const w = paper.paperSize.width
  const h = paper.paperSize.height
  const footH = roundPx(9)
  const barH = h - g * 3 - footH
  const epcW = roundPx(12)
  return {
    ...paper,
    id: 'walmart-rfid-50x35',
    name: 'Walmart RFID 50×35',
    markCustomer: 'Walmart',
    markKind: 'sticker',
    elements: [
      barcodeEl('upc', {
        x: g,
        y: g,
        w: w - g * 2,
        h: barH,
        format: 'upca',
        font: 'OCR-B',
        displayValue: true
      }),
      textEl('epc', {
        x: g,
        y: h - g - footH,
        w: epcW,
        h: footH,
        content: 'EPC',
        size: 11,
        weight: 'bold',
        align: 'center',
        color: '#ffffff',
        bg: '#000000'
      }),
      textEl('desc', {
        x: g * 2 + epcW,
        y: h - g - footH,
        w: w - g * 3 - epcW,
        h: footH,
        content: '${ds1.DESC}',
        size: 10
      })
    ]
  }
}

/** Target selling-unit ticket from TG-211 (~4×4"): centered DPCI, UPC, PO / VCP, COO. */
export function targetTicket4x4 () {
  const widthMm = 101.6
  const heightMm = 101.6
  const paper = labelPaper(widthMm, heightMm)
  const w = paper.paperSize.width
  const m = 20
  return {
    ...paper,
    paperOrientation: 'portrait',
    id: 'target-ticket-4x4',
    name: 'Target ticket 4×4',
    markCustomer: 'Target',
    markKind: 'ticket',
    elements: [
      textEl('dpci', {
        x: m,
        y: 16,
        w: w - m * 2,
        h: 36,
        content: 'DPCI: ${ds1.DPCI}',
        size: 22,
        weight: 'bold',
        align: 'center'
      }),
      barcodeEl('upc', {
        x: 28,
        y: 56,
        w: w - 56,
        h: 228,
        format: 'upca',
        font: 'OCR-B'
      }),
      textEl('po', {
        x: m,
        y: 296,
        w: (w - m * 2) / 2,
        h: 26,
        content: 'PO#: ${ds1.PO}',
        size: 16,
        weight: 'bold'
      }),
      textEl('vcp', {
        x: w / 2,
        y: 296,
        w: (w - m * 2) / 2,
        h: 26,
        content: 'VCP/SSP:1/1',
        size: 16,
        weight: 'bold',
        align: 'right'
      }),
      textEl('coo', {
        x: m,
        y: 328,
        w: w - m * 2,
        h: 24,
        content: 'Country of Origin: ${ds1.COO}',
        size: 13,
        weight: 'bold'
      })
    ]
  }
}

function ship4x6 (spec) {
  const widthMm = 101.6
  const heightMm = 152.4
  const paper = labelPaper(widthMm, heightMm, { rfid: false })
  const w = paper.paperSize.width
  const g = 14
  return {
    ...paper,
    paperOrientation: 'portrait',
    id: spec.id,
    name: spec.name,
    markCustomer: spec.customer,
    markKind: 'shipping',
    elements: [
      textEl('title', {
        x: g,
        y: 10,
        w: w - g * 2,
        h: 24,
        content: spec.title,
        size: 18,
        weight: 'bold',
        align: 'center'
      }),
      textEl('line1', {
        x: g,
        y: 40,
        w: w - g * 2,
        h: 20,
        content: spec.line1,
        size: 14,
        weight: 'bold'
      }),
      textEl('line2', {
        x: g,
        y: 64,
        w: w - g * 2,
        h: 20,
        content: spec.line2,
        size: 14,
        weight: 'bold'
      }),
      textEl('line3', {
        x: g,
        y: 88,
        w: (w - g * 2) / 2,
        h: 20,
        content: spec.line3,
        size: 14,
        weight: 'bold'
      }),
      textEl('line4', {
        x: w / 2,
        y: 88,
        w: (w - g * 2) / 2,
        h: 20,
        content: spec.line4,
        size: 14,
        weight: 'bold',
        align: 'right'
      }),
      textEl('desc', {
        x: g,
        y: 114,
        w: w - g * 2,
        h: 28,
        content: spec.desc || '${ds1.DESC}',
        size: 12
      }),
      barcodeEl('sscc', {
        x: g,
        y: 150,
        w: w - g * 2,
        h: 280,
        content: '${ds1.SSCC}',
        format: 'sscc',
        font: 'OCR-B',
        displayValue: true
      })
    ]
  }
}

/** Home Depot 4×6: SSCC-18 + GS1-128, thermal, ANSI C. Print only. */
export function homeDepotGs1_4x6 () {
  return ship4x6({
    id: 'homedepot-gs1-4x6',
    name: 'Home Depot GS1-128 4×6',
    customer: 'Home Depot',
    title: 'HOME DEPOT',
    line1: 'SKU: ${ds1.SKU}',
    line2: 'PO: ${ds1.PO}',
    line3: 'QTY: ${ds1.QTY}',
    line4: '${ds1.VENDOR}'
  })
}

/** Walmart 4×6 case shipping label: SSCC + PO / GTIN. */
export function walmartShip4x6 () {
  return ship4x6({
    id: 'walmart-ship-4x6',
    name: 'Walmart ship 4×6 SSCC',
    customer: 'Walmart',
    title: 'WALMART',
    line1: 'PO: ${ds1.PO}',
    line2: 'GTIN: ${ds1.ITF14}',
    line3: 'PACK: ${ds1.QTY}',
    line4: '${ds1.ITEM}'
  })
}

/** Target 4×6 carton: DPCI + PO + SSCC (one format per PO, approved). */
export function targetCarton4x6 () {
  return ship4x6({
    id: 'target-carton-4x6',
    name: 'Target carton 4×6',
    customer: 'Target',
    title: 'TARGET',
    line1: 'DPCI: ${ds1.DPCI}',
    line2: 'PO#: ${ds1.PO}',
    line3: 'VCP/SSP:1/1',
    line4: '${ds1.ITEM}'
  })
}

function upcSticker (spec) {
  const widthMm = spec.widthMm || 50
  const heightMm = spec.heightMm || 30
  const paper = labelPaper(widthMm, heightMm, { rfid: false })
  const w = paper.paperSize.width
  const h = paper.paperSize.height
  const g = roundPx(2)
  return {
    ...paper,
    id: spec.id,
    name: spec.name,
    markCustomer: spec.customer,
    markKind: 'sticker',
    elements: [
      barcodeEl('upc', {
        x: g,
        y: g,
        w: w - g * 2,
        h: h - g * 2,
        content: '${ds1.UPC}',
        format: 'upca',
        font: 'OCR-B',
        displayValue: true
      })
    ]
  }
}

/** Home Depot selling-unit / carton-side UPC (picket fence). */
export function homeDepotUpcSticker () {
  return upcSticker({
    id: 'homedepot-upc-sticker',
    name: 'Home Depot UPC sticker',
    customer: 'Home Depot'
  })
}

/** Walmart product UPC sticker (no RFID — carton side / polybag). */
export function walmartUpcSticker () {
  return upcSticker({
    id: 'walmart-upc-sticker',
    name: 'Walmart UPC sticker',
    customer: 'Walmart'
  })
}

/** Whitmor selling-unit UPC (brand prefix e.g. 038861). */
export function whitmorUpcSticker () {
  return upcSticker({
    id: 'whitmor-upc-sticker',
    name: 'Whitmor UPC sticker',
    customer: 'Whitmor'
  })
}

/** Whitmor 4×6 carton/ship: SSCC + style / PO. Print only. */
export function whitmorShip4x6 () {
  return ship4x6({
    id: 'whitmor-ship-4x6',
    name: 'Whitmor ship 4×6 SSCC',
    customer: 'Whitmor',
    title: 'WHITMOR',
    line1: 'STYLE: ${ds1.ITEM}',
    line2: 'PO: ${ds1.PO}',
    line3: 'PACK: ${ds1.QTY}',
    line4: '${ds1.SKU}'
  })
}

/** Whitmor outer carton: ITF-14 + style / pack. No item RFID. */
export function whitmorCartonItf14 () {
  const widthMm = 101.6
  const heightMm = 76.2
  const paper = labelPaper(widthMm, heightMm, { rfid: false })
  const w = paper.paperSize.width
  const g = 12
  return {
    ...paper,
    paperOrientation: 'landscape',
    id: 'whitmor-carton-itf14',
    name: 'Whitmor carton ITF-14',
    markCustomer: 'Whitmor',
    markKind: 'carton',
    elements: [
      textEl('title', {
        x: g,
        y: 8,
        w: 90,
        h: 22,
        content: 'WHITMOR',
        size: 14,
        weight: 'bold'
      }),
      textEl('item', {
        x: g + 96,
        y: 8,
        w: w - g * 2 - 96,
        h: 22,
        content: 'STYLE: ${ds1.ITEM}',
        size: 14,
        weight: 'bold'
      }),
      barcodeEl('itf', {
        x: g,
        y: 34,
        w: w - g * 2,
        h: 150,
        content: '${ds1.ITF14}',
        format: 'itf14',
        font: 'OCR-B',
        displayValue: true
      }),
      textEl('po', {
        x: g,
        y: 190,
        w: (w - g * 2) / 2,
        h: 20,
        content: 'PO: ${ds1.PO}',
        size: 13,
        weight: 'bold'
      }),
      textEl('pack', {
        x: w / 2,
        y: 190,
        w: (w - g * 2) / 2,
        h: 20,
        content: 'PACK: ${ds1.QTY}',
        size: 13,
        weight: 'bold',
        align: 'right'
      })
    ]
  }
}

/** Walmart carton mark: ITF-14 + PO / pack. Box itself is not encoded. */
export function walmartCartonItf14 () {
  const widthMm = 101.6
  const heightMm = 76.2
  const paper = labelPaper(widthMm, heightMm, { rfid: false })
  const w = paper.paperSize.width
  const g = 12
  return {
    ...paper,
    paperOrientation: 'landscape',
    id: 'walmart-carton-itf14',
    name: 'Walmart carton ITF-14',
    markCustomer: 'Walmart',
    markKind: 'carton',
    elements: [
      textEl('item', {
        x: g,
        y: 8,
        w: (w - g * 2) * 0.62,
        h: 22,
        content: 'ITEM: ${ds1.ITEM}',
        size: 14,
        weight: 'bold'
      }),
      textEl('rfid', {
        x: w - g - 56,
        y: 8,
        w: 56,
        h: 22,
        content: 'RFID',
        size: 14,
        weight: 'bold',
        align: 'center',
        color: '#ffffff',
        bg: '#000000'
      }),
      barcodeEl('itf', {
        x: g,
        y: 34,
        w: w - g * 2,
        h: 150,
        content: '${ds1.ITF14}',
        format: 'itf14',
        font: 'OCR-B',
        displayValue: true
      }),
      textEl('po', {
        x: g,
        y: 190,
        w: (w - g * 2) / 2,
        h: 20,
        content: 'PO: ${ds1.PO}',
        size: 13,
        weight: 'bold'
      }),
      textEl('pack', {
        x: w / 2,
        y: 190,
        w: (w - g * 2) / 2,
        h: 20,
        content: 'PACK: ${ds1.QTY}',
        size: 13,
        weight: 'bold',
        align: 'right'
      })
    ]
  }
}

export const RFID_MARKS = [
  {
    id: 'walmart-rfid-83x25',
    customer: 'Walmart',
    titleKey: 'printData.markWalmartHangtag',
    sizeMm: { width: 83, height: 25 },
    kind: 'hangtag',
    build: walmartHangtag83x25
  },
  {
    id: 'walmart-rfid-50x35',
    customer: 'Walmart',
    titleKey: 'printData.markWalmartSticker',
    sizeMm: { width: 50, height: 35 },
    kind: 'sticker',
    build: walmartSticker50x35
  },
  {
    id: 'target-ticket-4x4',
    customer: 'Target',
    titleKey: 'printData.markTargetTicket',
    sizeMm: { width: 101.6, height: 101.6 },
    kind: 'ticket',
    build: targetTicket4x4
  },
  {
    id: 'homedepot-gs1-4x6',
    customer: 'Home Depot',
    titleKey: 'printData.markHomeDepotGs1',
    sizeMm: { width: 101.6, height: 152.4 },
    kind: 'shipping',
    build: homeDepotGs1_4x6
  },
  {
    id: 'walmart-carton-itf14',
    customer: 'Walmart',
    titleKey: 'printData.markWalmartCarton',
    sizeMm: { width: 101.6, height: 76.2 },
    kind: 'carton',
    build: walmartCartonItf14
  },
  {
    id: 'walmart-ship-4x6',
    customer: 'Walmart',
    titleKey: 'printData.markWalmartShip',
    sizeMm: { width: 101.6, height: 152.4 },
    kind: 'shipping',
    build: walmartShip4x6
  },
  {
    id: 'target-carton-4x6',
    customer: 'Target',
    titleKey: 'printData.markTargetCarton',
    sizeMm: { width: 101.6, height: 152.4 },
    kind: 'shipping',
    build: targetCarton4x6
  },
  {
    id: 'homedepot-upc-sticker',
    customer: 'Home Depot',
    titleKey: 'printData.markHomeDepotUpc',
    sizeMm: { width: 50, height: 30 },
    kind: 'sticker',
    build: homeDepotUpcSticker
  },
  {
    id: 'walmart-upc-sticker',
    customer: 'Walmart',
    titleKey: 'printData.markWalmartUpc',
    sizeMm: { width: 50, height: 30 },
    kind: 'sticker',
    build: walmartUpcSticker
  },
  {
    id: 'whitmor-upc-sticker',
    customer: 'Whitmor',
    titleKey: 'printData.markWhitmorUpc',
    sizeMm: { width: 50, height: 30 },
    kind: 'sticker',
    build: whitmorUpcSticker
  },
  {
    id: 'whitmor-carton-itf14',
    customer: 'Whitmor',
    titleKey: 'printData.markWhitmorCarton',
    sizeMm: { width: 101.6, height: 76.2 },
    kind: 'carton',
    build: whitmorCartonItf14
  },
  {
    id: 'whitmor-ship-4x6',
    customer: 'Whitmor',
    titleKey: 'printData.markWhitmorShip',
    sizeMm: { width: 101.6, height: 152.4 },
    kind: 'shipping',
    build: whitmorShip4x6
  }
]

export function findRfidMark (id) {
  const hit = RFID_MARKS.find((m) => m.id === String(id || '').trim())
  if (!hit) return null
  return { ...hit, template: hit.build() }
}

export function rfidMarkTemplate (id) {
  const mark = findRfidMark(id)
  return mark ? mark.template : null
}

export function isLabelMarkTemplate (template) {
  if (!template || typeof template !== 'object') return false
  if (template.rfidMark) return true
  return template.printKind === 'label'
}

export const TEMPLATE_ORIGIN_DESIGNER = 'designer'
export const TEMPLATE_ORIGIN_WORKSPACE = 'workspace'

/** 设计器保存的是通用模板；工作区「新增模板」才带 workspace origin。 */
export function isWorkspaceOriginTemplate (template) {
  return !!(template && String(template.origin || '').toLowerCase() === TEMPLATE_ORIGIN_WORKSPACE)
}

export function withWorkspaceOrigin (template, jobId) {
  const next = { ...(template || {}), origin: TEMPLATE_ORIGIN_WORKSPACE }
  const jid = String(jobId || '').trim()
  if (jid) next.workspaceJobId = jid
  else delete next.workspaceJobId
  return next
}

export function withDesignerOrigin (template) {
  const next = { ...(template || {}), origin: TEMPLATE_ORIGIN_DESIGNER }
  delete next.workspaceJobId
  return next
}

export function describeSavedMark (id, template) {
  const key = String(id || '').trim()
  const builtin = RFID_MARKS.find((m) => m.id === key)
  const mm = template && template.customPaperSizeMm
  let sizeMm = builtin ? { ...builtin.sizeMm } : { width: 0, height: 0 }
  if (mm && Number(mm.width) > 0 && Number(mm.height) > 0) {
    sizeMm = { width: Number(mm.width), height: Number(mm.height) }
  } else if (template && template.paperSize) {
    const w = Number(template.paperSize.width)
    const h = Number(template.paperSize.height)
    if (w > 0 && h > 0) {
      sizeMm = {
        width: Math.round(pxToMm(w) * 10) / 10,
        height: Math.round(pxToMm(h) * 10) / 10
      }
    }
  }
  const named = template && String(template.name || '').trim()
  return {
    id: key,
    title: named || key,
    titleKey: named ? '' : (builtin && builtin.titleKey) || '',
    customer: (template && template.markCustomer) || (builtin && builtin.customer) || '',
    sizeMm,
    kind: (template && template.markKind) || (builtin && builtin.kind) || 'label',
    rfidMark: !!(template && template.rfidMark) || !!builtin,
    origin: isWorkspaceOriginTemplate(template) ? TEMPLATE_ORIGIN_WORKSPACE : TEMPLATE_ORIGIN_DESIGNER
  }
}

function customerKeyOf (value) {
  return String(value ?? '').replace(/[\s_\-]+/g, '').toLowerCase()
}

/** One match only — Walmart has two sizes, so do not auto-pick 83 or 50. */
export function suggestMarkId (customer, marks = RFID_MARKS) {
  const c = customerKeyOf(customer)
  if (!c) return ''
  const hits = (marks || []).filter((m) => {
    const mc = customerKeyOf(m.customer)
    return mc && (c.includes(mc) || mc.includes(c))
  })
  return hits.length === 1 ? hits[0].id : ''
}
