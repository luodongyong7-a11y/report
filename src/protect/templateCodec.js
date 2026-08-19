import { aesGcmDecryptSoft, aesGcmEncryptSoft, hmacSha256Soft, sha256Soft } from './softCrypto.js'

const DEFAULT_SECRET = 'niqer-nqt-v1-secret!'
const INFO_MASTER = te('nqt-master')
const INFO_ENC = te('nqt-enc')
const XOR_LABEL = te('xor')
const PERM_LABEL = te('perm')
const MAC_PREFIX = te('nqt1')

function te (s) {
  return new TextEncoder().encode(s)
}

function td (bytes) {
  return new TextDecoder('utf-8').decode(bytes)
}

function concat (...parts) {
  let n = 0
  for (const p of parts) n += p.length
  const out = new Uint8Array(n)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

function u32 (v) {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, v >>> 0, false)
  return b
}

function hex (bytes) {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

function unhex (str) {
  const s = String(str || '')
  if (s.length % 2) throw new Error('hex')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

function b64url (bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function unb64url (s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function resolveSecret (raw) {
  let s = raw == null ? '' : String(raw).trim()
  if (!s) s = DEFAULT_SECRET
  if (s.length >= 32 && s.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(s)) return unhex(s)
  const utf8 = te(s)
  if (utf8.length < 16) throw new Error('secret too short')
  return utf8
}

function hasSubtle () {
  return !!(globalThis.crypto && crypto.subtle)
}

async function sha256 (bytes) {
  if (hasSubtle()) return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return sha256Soft(bytes)
}

async function hmac (key, data) {
  if (hasSubtle()) {
    const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
  }
  return hmacSha256Soft(key, data)
}

async function hkdf (ikm, salt, info, len) {
  const prk = await hmac(salt, ikm)
  const out = new Uint8Array(len)
  let t = new Uint8Array(0)
  let pos = 0
  let c = 1
  while (pos < len) {
    t = await hmac(prk, concat(t, info, new Uint8Array([c])))
    const n = Math.min(t.length, len - pos)
    out.set(t.subarray(0, n), pos)
    pos += n
    c++
  }
  return out
}

async function aesGcm (keyBytes, iv, data, encrypt) {
  if (hasSubtle()) {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [encrypt ? 'encrypt' : 'decrypt'])
    const buf = encrypt
      ? await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, data)
      : await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, data)
    return new Uint8Array(buf)
  }
  return encrypt ? aesGcmEncryptSoft(keyBytes, iv, data) : aesGcmDecryptSoft(keyBytes, iv, data)
}

async function deriveMaster (secretText) {
  return hkdf(resolveSecret(secretText), new Uint8Array(32), INFO_MASTER, 32)
}

class Sha256Ctr {
  constructor (seed) {
    this.seed = seed
    this.counter = 0
    this.buf = new Uint8Array(0)
    this.pos = 0
  }

  nextU32 () {
    this.ensure(4)
    const v = ((this.buf[this.pos] << 24) | (this.buf[this.pos + 1] << 16) | (this.buf[this.pos + 2] << 8) | this.buf[this.pos + 3]) >>> 0
    this.pos += 4
    return v
  }

  ensure (n) {
    if (this.pos + n <= this.buf.length) return
    this.buf = sha256Soft(concat(this.seed, u32(this.counter++)))
    this.pos = 0
  }
}

function permute (input, permSeed, inverse) {
  const data = new Uint8Array(input)
  const n = data.length
  if (n < 2) return data
  const order = new Int32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  const rng = new Sha256Ctr(permSeed)
  for (let i = n - 1; i >= 1; i--) {
    const j = rng.nextU32() % (i + 1)
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  const out = new Uint8Array(n)
  if (!inverse) {
    for (let i = 0; i < n; i++) out[i] = data[order[i]]
  } else {
    for (let i = 0; i < n; i++) out[order[i]] = data[i]
  }
  return out
}

function xorInPlace (data, nonce, master) {
  let block = 0
  let off = 0
  while (off < data.length) {
    const ks = hmacSha256Soft(master, concat(nonce, XOR_LABEL, u32(block++)))
    const n = Math.min(ks.length, data.length - off)
    for (let i = 0; i < n; i++) data[off + i] ^= ks[i]
    off += n
  }
}

const VERSION = 1
const HEADER_LEN = 25
const MAC_LEN = 32

function asBytes (data) {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return null
}

function viewOf (bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function isTextEnvelope (text) {
  if (text == null) return false
  let s = String(text)
  if (s.charAt(0) === '\uFEFF') s = s.slice(1)
  s = s.replace(/^\s+/, '')
  return s.startsWith('NQT1\n') || s.startsWith('NQT1\r\n')
}

function isBinaryEnvelope (bytes) {
  if (!bytes || bytes.length < HEADER_LEN + 16 + MAC_LEN) return false
  if (bytes[0] !== 0x4e || bytes[1] !== 0x51 || bytes[2] !== 0x54 || bytes[3] !== 0x31) return false
  if (bytes[4] !== VERSION) return false
  const ctLen = viewOf(bytes).getUint32(21, false)
  return ctLen >= 16 && bytes.length === HEADER_LEN + ctLen + MAC_LEN
}

export const TEMPLATE_FILE_EXT = '.nqt'

export function envelopeFileName (id) {
  let name = String(id || '').replace(/^.*[/\\]/, '').trim()
  if (!name) name = 'template'
  return /\.nqt$/i.test(name) ? name : name + TEMPLATE_FILE_EXT
}

export function isEnvelope (data) {
  const bytes = asBytes(data)
  if (bytes && isBinaryEnvelope(bytes)) return true
  if (typeof data === 'string') return isTextEnvelope(data)
  if (bytes) {
    try { return isTextEnvelope(td(bytes)) } catch { return false }
  }
  return false
}

async function unlock (nonce, packed, mac, secret) {
  if (nonce.length !== 16 || packed.length < 16) throw new Error('template envelope invalid')
  const master = await deriveMaster(secret)
  const expect = await hmac(master, concat(MAC_PREFIX, nonce, packed))
  if (expect.length !== mac.length) throw new Error('template envelope invalid')
  let diff = 0
  for (let i = 0; i < mac.length; i++) diff |= expect[i] ^ mac[i]
  if (diff) throw new Error('template envelope invalid')
  const encKey = await hkdf(master, nonce, INFO_ENC, 32)
  const obfuscated = await aesGcm(encKey, nonce.subarray(0, 12), packed, false)
  xorInPlace(obfuscated, nonce, master)
  const permSeed = await hmac(master, concat(nonce, PERM_LABEL))
  const plain = permute(obfuscated, permSeed, true)
  const json = td(plain)
  JSON.parse(json)
  return json
}

async function openBinary (bytes, secret) {
  const dv = viewOf(bytes)
  const nonce = bytes.subarray(5, 21)
  const ctLen = dv.getUint32(21, false)
  const packed = bytes.subarray(25, 25 + ctLen)
  const mac = bytes.subarray(25 + ctLen, 25 + ctLen + MAC_LEN)
  return unlock(nonce, packed, mac, secret)
}

async function openText (text, secret) {
  let body = String(text)
  if (body.charAt(0) === '\uFEFF') body = body.slice(1)
  body = body.replace(/^\s+/, '')
  let nHex = ''
  let cB64 = ''
  let mB64 = ''
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('n=')) nHex = line.slice(2).trim()
    else if (line.startsWith('c=')) cB64 = line.slice(2).trim()
    else if (line.startsWith('m=')) mB64 = line.slice(2).trim()
  }
  if (!nHex || !cB64 || !mB64) throw new Error('template envelope invalid')
  return unlock(unhex(nHex), unb64url(cB64), unb64url(mB64), secret)
}

export async function encodeTemplate (objOrText, secret) {
  const plain = typeof objOrText === 'string' ? objOrText : JSON.stringify(objOrText)
  JSON.parse(plain)
  const master = await deriveMaster(secret)
  const nonce = new Uint8Array(16)
  crypto.getRandomValues(nonce)
  const permSeed = await hmac(master, concat(nonce, PERM_LABEL))
  const obfuscated = permute(te(plain), permSeed, false)
  xorInPlace(obfuscated, nonce, master)
  const encKey = await hkdf(master, nonce, INFO_ENC, 32)
  const packed = await aesGcm(encKey, nonce.subarray(0, 12), obfuscated, true)
  const mac = await hmac(master, concat(MAC_PREFIX, nonce, packed))
  const out = new Uint8Array(HEADER_LEN + packed.length + MAC_LEN)
  const dv = new DataView(out.buffer)
  out[0] = 0x4e
  out[1] = 0x51
  out[2] = 0x54
  out[3] = 0x31
  out[4] = VERSION
  out.set(nonce, 5)
  dv.setUint32(21, packed.length, false)
  out.set(packed, 25)
  out.set(mac, 25 + packed.length)
  return out
}

export async function decodeTemplate (data, secret) {
  const bytes = asBytes(data)
  if (bytes && isBinaryEnvelope(bytes)) return openBinary(bytes, secret)
  if (typeof data === 'string' && isTextEnvelope(data)) return openText(data, secret)
  if (bytes && isTextEnvelope(td(bytes))) return openText(td(bytes), secret)
  throw new Error('template envelope invalid')
}

export function parseLoadedContent (data) {
  const bytes = asBytes(data)
  if (bytes) {
    if (isEnvelope(bytes)) return decodeTemplate(bytes)
    return Promise.resolve(td(bytes))
  }
  const raw = String(data || '').replace(/^\uFEFF/, '')
  if (isEnvelope(raw)) return decodeTemplate(raw)
  return Promise.resolve(raw)
}
