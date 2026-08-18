/**
 * Supported barcode catalog (BCID + description + sample).
 * Ids stay bwip-style so designer / import templates keep working.
 * Encode/decode lives in @niqer/barcode; this file is the report-layer list.
 * Do not import a third-party barcode library here.
 */
import { listSymbologies } from '@niqer/barcode'

const DESC_KEY = {
  upca: 'designer.main.symUpca',
  upce: 'designer.main.symUpce',
  ean13: 'designer.main.symEan13',
  ean8: 'designer.main.symEan8',
  isbn: 'designer.main.symIsbn',
  ismn: 'designer.main.symIsmn',
  issn: 'designer.main.symIssn',
  'gs1-128': 'designer.main.symGs1128',
  sscc: 'designer.main.symSscc',
  itf14: 'designer.main.symItf14',
  ean14: 'designer.main.symEan14',
  gs1datamatrix: 'designer.main.symGs1Dm',
  code128: 'designer.main.symCode128',
  code39: 'designer.main.symCode39',
  code93: 'designer.main.symCode93',
  codabar: 'designer.main.symCodabar',
  interleaved2of5: 'designer.main.symItf',
  industrial2of5: 'designer.main.symI25',
  msi: 'designer.main.symMsi',
  code11: 'designer.main.symCode11',
  pharmacode: 'designer.main.symPharmacode',
  postnet: 'designer.main.symPostnet',
  qrcode: 'designer.main.symQr',
  datamatrix: 'designer.main.symDm',
  pdf417: 'designer.main.symPdf417',
  azteccode: 'designer.main.symAztec'
}

export const BARCODE_BWIP_SYMBOLS = listSymbologies().map((s) => ({
  bcid: s.id,
  desc: s.desc,
  descKey: s.descKey || DESC_KEY[s.id],
  sample: s.sample,
  opts: '',
  group: s.group || (s.matrix ? 'matrix' : 'linear')
}))

const BCID_SET = new Set(BARCODE_BWIP_SYMBOLS.map((s) => s.bcid))
const BY_BCID = new Map(BARCODE_BWIP_SYMBOLS.map((s) => [s.bcid, s]))
const MATRIX_BCIDS = new Set(['qrcode', 'datamatrix', 'gs1datamatrix', 'pdf417', 'azteccode'])

const GROUP_META = [
  { id: 'retail', labelKey: 'designer.main.compGroupRetail' },
  { id: 'gs1', labelKey: 'designer.main.compGroupGs1' },
  { id: 'linear', labelKey: 'designer.main.compGroupLinear' },
  { id: 'matrix', labelKey: 'designer.main.compGroupMatrix' }
]

export function isKnownBwipBcid (bcid) {
  return BCID_SET.has(String(bcid || '').toLowerCase())
}

export function getBwipSymbolMeta (bcid) {
  return BY_BCID.get(String(bcid || '').toLowerCase()) || null
}

/** Parse leftover demo opts string: "includetext guardwhitespace type=29". */
export function parseBwipOptsString (opts) {
  const out = {}
  for (const tok of String(opts || '').trim().split(/\s+/)) {
    if (!tok) continue
    const eq = tok.indexOf('=')
    if (eq === -1) {
      out[tok] = true
    } else {
      const key = tok.slice(0, eq)
      let val = tok.slice(eq + 1)
      if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val)
      out[key] = val
    }
  }
  return out
}

export function isBwipMatrixBcid (bcid) {
  return MATRIX_BCIDS.has(String(bcid || '').toLowerCase())
}

export function listBwipSymbols ({ matrix } = {}) {
  if (matrix === true) return BARCODE_BWIP_SYMBOLS.filter((s) => isBwipMatrixBcid(s.bcid))
  if (matrix === false) return BARCODE_BWIP_SYMBOLS.filter((s) => !isBwipMatrixBcid(s.bcid))
  return BARCODE_BWIP_SYMBOLS.slice()
}

export function listBwipSymbolGroups () {
  return GROUP_META.map((g) => ({
    ...g,
    items: BARCODE_BWIP_SYMBOLS.filter((s) => s.group === g.id)
  })).filter((g) => g.items.length)
}
