const SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
])

const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

const RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]

function rotr (x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0
}

function concatBytes (a, b) {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

export function sha256Soft (msg) {
  const bitLen = msg.length * 8
  let padLen = msg.length + 1 + 8
  if (padLen % 64) padLen += 64 - (padLen % 64)
  const buf = new Uint8Array(padLen)
  buf.set(msg)
  buf[msg.length] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(padLen - 4, bitLen >>> 0, false)
  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19
  const w = new Uint32Array(64)
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + SHA_K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }
  const out = new Uint8Array(32)
  const ov = new DataView(out.buffer)
  ov.setUint32(0, h0, false)
  ov.setUint32(4, h1, false)
  ov.setUint32(8, h2, false)
  ov.setUint32(12, h3, false)
  ov.setUint32(16, h4, false)
  ov.setUint32(20, h5, false)
  ov.setUint32(24, h6, false)
  ov.setUint32(28, h7, false)
  return out
}

export function hmacSha256Soft (key, data) {
  let k = key
  if (k.length > 64) k = sha256Soft(k)
  const ipad = new Uint8Array(64)
  const opad = new Uint8Array(64)
  ipad.set(k)
  opad.set(k)
  for (let i = 0; i < 64; i++) {
    ipad[i] ^= 0x36
    opad[i] ^= 0x5c
  }
  return sha256Soft(concatBytes(opad, sha256Soft(concatBytes(ipad, data))))
}

function xtime (a) {
  return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff
}

function expandKey256 (key) {
  const w = new Uint8Array(240)
  w.set(key.subarray(0, 32))
  for (let i = 8; i < 60; i++) {
    let t0 = w[(i - 1) * 4]
    let t1 = w[(i - 1) * 4 + 1]
    let t2 = w[(i - 1) * 4 + 2]
    let t3 = w[(i - 1) * 4 + 3]
    if (i % 8 === 0) {
      const r = SBOX[t1] ^ RCON[i / 8]
      const a = SBOX[t2]
      const b = SBOX[t3]
      const c = SBOX[t0]
      t0 = r
      t1 = a
      t2 = b
      t3 = c
    } else if (i % 8 === 4) {
      t0 = SBOX[t0]
      t1 = SBOX[t1]
      t2 = SBOX[t2]
      t3 = SBOX[t3]
    }
    w[i * 4] = w[(i - 8) * 4] ^ t0
    w[i * 4 + 1] = w[(i - 8) * 4 + 1] ^ t1
    w[i * 4 + 2] = w[(i - 8) * 4 + 2] ^ t2
    w[i * 4 + 3] = w[(i - 8) * 4 + 3] ^ t3
  }
  return w
}

function addRoundKey (s, rk, round) {
  const o = round * 16
  for (let i = 0; i < 16; i++) s[i] ^= rk[o + i]
}

function shiftRows (s) {
  let t = s[1]
  s[1] = s[5]
  s[5] = s[9]
  s[9] = s[13]
  s[13] = t
  t = s[2]
  s[2] = s[10]
  s[10] = t
  t = s[6]
  s[6] = s[14]
  s[14] = t
  t = s[15]
  s[15] = s[11]
  s[11] = s[7]
  s[7] = s[3]
  s[3] = t
}

function mixColumn (c) {
  const a0 = c[0]
  const a1 = c[1]
  const a2 = c[2]
  const a3 = c[3]
  c[0] = xtime(a0) ^ xtime(a1) ^ a1 ^ a2 ^ a3
  c[1] = a0 ^ xtime(a1) ^ xtime(a2) ^ a2 ^ a3
  c[2] = a0 ^ a1 ^ xtime(a2) ^ xtime(a3) ^ a3
  c[3] = xtime(a0) ^ a0 ^ a1 ^ a2 ^ xtime(a3)
}

function mixColumns (s) {
  for (let i = 0; i < 4; i++) {
    const c = [s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3]]
    mixColumn(c)
    s[i * 4] = c[0]
    s[i * 4 + 1] = c[1]
    s[i * 4 + 2] = c[2]
    s[i * 4 + 3] = c[3]
  }
}

function aes256EncryptBlock (input, key) {
  const rk = key.byteLength === 240 ? key : expandKey256(key)
  const s = new Uint8Array(input)
  addRoundKey(s, rk, 0)
  for (let r = 1; r < 14; r++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]
    shiftRows(s)
    mixColumns(s)
    addRoundKey(s, rk, r)
  }
  for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]
  shiftRows(s)
  addRoundKey(s, rk, 14)
  return s
}

function inc32 (block) {
  const out = new Uint8Array(block)
  for (let i = 15; i >= 12; i--) {
    out[i] = (out[i] + 1) & 0xff
    if (out[i]) break
  }
  return out
}

function xor16 (a, b) {
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = a[i] ^ b[i]
  return out
}

function ghashMul (x, y) {
  const z = new Uint8Array(16)
  const v = new Uint8Array(y)
  for (let i = 0; i < 16; i++) {
    for (let bit = 7; bit >= 0; bit--) {
      if ((x[i] >>> bit) & 1) {
        for (let k = 0; k < 16; k++) z[k] ^= v[k]
      }
      const lsb = v[15] & 1
      for (let k = 15; k > 0; k--) v[k] = ((v[k] >>> 1) | ((v[k - 1] & 1) << 7)) & 0xff
      v[0] = (v[0] >>> 1) & 0xff
      if (lsb) v[0] ^= 0xe1
    }
  }
  return z
}

function ghash (h, cipher) {
  let y = new Uint8Array(16)
  for (let i = 0; i < cipher.length; i += 16) {
    const block = new Uint8Array(16)
    const n = Math.min(16, cipher.length - i)
    for (let j = 0; j < n; j++) block[j] = cipher[i + j]
    y = ghashMul(xor16(y, block), h)
  }
  const len = new Uint8Array(16)
  const dv = new DataView(len.buffer)
  dv.setUint32(12, (cipher.length * 8) >>> 0, false)
  return ghashMul(xor16(y, len), h)
}

function gctr (rk, icb, data) {
  if (!data.length) return new Uint8Array(0)
  const out = new Uint8Array(data.length)
  let cb = new Uint8Array(icb)
  let off = 0
  while (off < data.length) {
    const ks = aes256EncryptBlock(cb, rk)
    const n = Math.min(16, data.length - off)
    for (let i = 0; i < n; i++) out[off + i] = data[off + i] ^ ks[i]
    off += n
    if (off < data.length) cb = inc32(cb)
  }
  return out
}

function gcmSetup (keyBytes, iv) {
  const rk = expandKey256(keyBytes)
  const h = aes256EncryptBlock(new Uint8Array(16), rk)
  const j0 = new Uint8Array(16)
  j0.set(iv.subarray(0, 12))
  j0[15] = 1
  return { rk, h, j0 }
}

export function aesGcmEncryptSoft (keyBytes, iv, plain) {
  const { rk, h, j0 } = gcmSetup(keyBytes, iv)
  const cipher = gctr(rk, inc32(j0), plain)
  const tag = gctr(rk, j0, ghash(h, cipher))
  const out = new Uint8Array(cipher.length + 16)
  out.set(cipher)
  out.set(tag, cipher.length)
  return out
}

export function aesGcmDecryptSoft (keyBytes, iv, packed) {
  if (packed.length < 16) throw new Error('template envelope invalid')
  const cipher = packed.subarray(0, packed.length - 16)
  const tag = packed.subarray(packed.length - 16)
  const { rk, h, j0 } = gcmSetup(keyBytes, iv)
  const expect = gctr(rk, j0, ghash(h, cipher))
  let diff = 0
  for (let i = 0; i < 16; i++) diff |= expect[i] ^ tag[i]
  if (diff) throw new Error('template envelope invalid')
  return gctr(rk, inc32(j0), cipher)
}
