// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/error.js
var PdfError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PdfError";
  }
};

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/syntax/bytes.js
var NUL = 0;
var TAB = 9;
var LF = 10;
var FF = 12;
var CR = 13;
var SPACE = 32;
function isWhitespace(b) {
  return b === NUL || b === TAB || b === LF || b === FF || b === CR || b === SPACE;
}
function isDelimiter(b) {
  return b === 40 || b === 41 || b === 60 || b === 62 || b === 91 || b === 93 || b === 123 || b === 125 || b === 47 || b === 37;
}
function isRegular(b) {
  return b >= 0 && b <= 255 && !isWhitespace(b) && !isDelimiter(b);
}
function isDigit(b) {
  return b >= 48 && b <= 57;
}
function isHex(b) {
  return b >= 48 && b <= 57 || b >= 65 && b <= 70 || b >= 97 && b <= 102;
}
function latin1Slice(bytes, start, end) {
  let s = "";
  const to = Math.min(end, bytes.length);
  for (let i = start; i < to; i++)
    s += String.fromCharCode(bytes[i]);
  return s;
}
function encodeLatin1(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++)
    out[i] = s.charCodeAt(i) & 255;
  return out;
}
function concatBytes(parts) {
  let total = 0;
  for (const p of parts)
    total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function lastIndexOfAscii(bytes, ascii) {
  const n2 = ascii.length;
  outer: for (let i = bytes.length - n2; i >= 0; i--) {
    for (let j = 0; j < n2; j++) {
      if (bytes[i + j] !== ascii.charCodeAt(j))
        continue outer;
    }
    return i;
  }
  return -1;
}
function randomBytes(n2) {
  const out = new Uint8Array(n2);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < n2; i++)
    out[i] = Math.floor(Math.random() * 256);
  return out;
}
function readUintBe(bytes, offset, width) {
  let v = 0;
  for (let i = 0; i < width; i++)
    v = (v << 8) + (bytes[offset + i] ?? 0);
  return v >>> 0;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/syntax/objects.js
var PdfName = class {
  value;
  kind = "name";
  constructor(value) {
    this.value = value;
  }
};
var PdfString = class {
  bytes;
  hex;
  kind = "string";
  constructor(bytes, hex = false) {
    this.bytes = bytes;
    this.hex = hex;
  }
  asLatin1() {
    let s = "";
    for (let i = 0; i < this.bytes.length; i++)
      s += String.fromCharCode(this.bytes[i]);
    return s;
  }
};
var PdfRef = class {
  num;
  gen;
  kind = "ref";
  constructor(num, gen) {
    this.num = num;
    this.gen = gen;
  }
  key() {
    return `${this.num} ${this.gen}`;
  }
};
var PdfArray = class {
  items;
  kind = "array";
  constructor(items = []) {
    this.items = items;
  }
};
var PdfDict = class {
  entries;
  kind = "dict";
  constructor(entries = /* @__PURE__ */ new Map()) {
    this.entries = entries;
  }
  get(key) {
    return this.entries.get(key);
  }
  set(key, value) {
    this.entries.set(key, value);
    return this;
  }
  has(key) {
    return this.entries.has(key);
  }
  delete(key) {
    return this.entries.delete(key);
  }
};
var PdfStream = class {
  dict;
  data;
  kind = "stream";
  constructor(dict, data) {
    this.dict = dict;
    this.data = data;
  }
};
function pdfName(value) {
  return new PdfName(value);
}
function asName(obj) {
  return obj instanceof PdfName ? obj.value : void 0;
}
function asNum(obj) {
  return typeof obj === "number" && Number.isFinite(obj) ? obj : void 0;
}
function asDict(obj) {
  if (obj instanceof PdfDict)
    return obj;
  if (obj instanceof PdfStream)
    return obj.dict;
  return void 0;
}
function asArray(obj) {
  return obj instanceof PdfArray ? obj : void 0;
}
function asRef(obj) {
  return obj instanceof PdfRef ? obj : void 0;
}
function asBox(obj) {
  const arr = asArray(obj);
  if (!arr || arr.items.length < 4)
    return void 0;
  const a = asNum(arr.items[0]);
  const b = asNum(arr.items[1]);
  const c = asNum(arr.items[2]);
  const d = asNum(arr.items[3]);
  if (a === void 0 || b === void 0 || c === void 0 || d === void 0)
    return void 0;
  return [a, b, c, d];
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/syntax/lexer.js
var Tokenizer = class {
  bytes;
  pos;
  pushed = [];
  constructor(bytes, pos = 0) {
    this.bytes = bytes;
    this.pos = pos;
  }
  peek() {
    if (!this.pushed.length)
      this.pushed.push(this.read());
    return this.pushed[0];
  }
  next() {
    if (this.pushed.length)
      return this.pushed.shift();
    return this.read();
  }
  unread(token) {
    this.pushed.unshift(token);
  }
  eof() {
    return this.pos >= this.bytes.length && this.pushed.length === 0;
  }
  skipWhitespaceAndComments() {
    const b = this.bytes;
    while (this.pos < b.length) {
      const c = b[this.pos];
      if (isWhitespace(c)) {
        this.pos++;
        continue;
      }
      if (c === 37) {
        this.pos++;
        while (this.pos < b.length) {
          const n2 = b[this.pos];
          if (n2 === CR || n2 === LF)
            break;
          this.pos++;
        }
        continue;
      }
      break;
    }
  }
  /**
  * After the `stream` keyword, consume one EOL. Adobe files often use a lone CR.
  */
  consumeStreamEol() {
    const b = this.bytes;
    if (this.pos < b.length && b[this.pos] === CR) {
      this.pos++;
      if (this.pos < b.length && b[this.pos] === LF)
        this.pos++;
      return;
    }
    if (this.pos < b.length && b[this.pos] === LF)
      this.pos++;
  }
  readBytes(n2) {
    const end = Math.min(this.pos + n2, this.bytes.length);
    const slice = this.bytes.subarray(this.pos, end);
    this.pos = end;
    return slice;
  }
  read() {
    this.skipWhitespaceAndComments();
    const b = this.bytes;
    if (this.pos >= b.length)
      return { kind: "eof" };
    const c = b[this.pos];
    if (c === 47)
      return { kind: "name", value: this.readName() };
    if (c === 40)
      return { kind: "string", value: this.readLiteralString() };
    if (c === 60) {
      if (this.pos + 1 < b.length && b[this.pos + 1] === 60) {
        this.pos += 2;
        return { kind: "dictStart" };
      }
      return { kind: "string", value: this.readHexString() };
    }
    if (c === 62) {
      if (this.pos + 1 < b.length && b[this.pos + 1] === 62) {
        this.pos += 2;
        return { kind: "dictEnd" };
      }
      throw new PdfError(`Unexpected '>' at offset ${this.pos}`);
    }
    if (c === 91) {
      this.pos++;
      return { kind: "arrayStart" };
    }
    if (c === 93) {
      this.pos++;
      return { kind: "arrayEnd" };
    }
    if (c === 43 || c === 45 || c === 46 || isDigit(c)) {
      const num = this.tryReadNumber();
      if (num !== null)
        return { kind: "number", value: num };
    }
    return { kind: "word", value: this.readWord() };
  }
  readName() {
    this.pos++;
    const start = this.pos;
    const b = this.bytes;
    while (this.pos < b.length && isRegular(b[this.pos]))
      this.pos++;
    let raw = latin1Slice(b, start, this.pos);
    if (!raw.includes("#"))
      return raw;
    let out = "";
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === "#" && i + 2 < raw.length && isHex(raw.charCodeAt(i + 1)) && isHex(raw.charCodeAt(i + 2))) {
        out += String.fromCharCode(parseInt(raw.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        out += raw[i];
      }
    }
    return out;
  }
  readLiteralString() {
    this.pos++;
    const out = [];
    let depth = 1;
    const b = this.bytes;
    while (this.pos < b.length) {
      let c = b[this.pos++];
      if (c === 92) {
        if (this.pos >= b.length)
          break;
        const e = b[this.pos++];
        if (e === 110)
          out.push(LF);
        else if (e === 114)
          out.push(CR);
        else if (e === 116)
          out.push(TAB);
        else if (e === 98)
          out.push(8);
        else if (e === 102)
          out.push(FF);
        else if (e === 40 || e === 41 || e === 92)
          out.push(e);
        else if (e >= 48 && e <= 55) {
          let oct = String.fromCharCode(e);
          for (let k = 0; k < 2 && this.pos < b.length; k++) {
            const d = b[this.pos];
            if (d < 48 || d > 55)
              break;
            oct += String.fromCharCode(d);
            this.pos++;
          }
          out.push(parseInt(oct, 8) & 255);
        } else if (e === CR) {
          if (this.pos < b.length && b[this.pos] === LF)
            this.pos++;
        } else if (e === LF) {
        } else {
          out.push(e);
        }
        continue;
      }
      if (c === CR) {
        if (this.pos < b.length && b[this.pos] === LF)
          this.pos++;
        out.push(LF);
        continue;
      }
      if (c === 40)
        depth++;
      else if (c === 41) {
        depth--;
        if (depth === 0)
          break;
      }
      out.push(c);
    }
    return new PdfString(Uint8Array.from(out), false);
  }
  readHexString() {
    this.pos++;
    let hex = "";
    const b = this.bytes;
    while (this.pos < b.length) {
      const c = b[this.pos];
      if (c === 62) {
        this.pos++;
        break;
      }
      if (isWhitespace(c)) {
        this.pos++;
        continue;
      }
      if (!isHex(c))
        throw new PdfError(`Invalid hex string byte at offset ${this.pos}`);
      hex += String.fromCharCode(c);
      this.pos++;
    }
    if (hex.length % 2 === 1)
      hex += "0";
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++)
      out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return new PdfString(out, true);
  }
  tryReadNumber() {
    const start = this.pos;
    const b = this.bytes;
    if (b[this.pos] === 43 || b[this.pos] === 45)
      this.pos++;
    let sawDigit = false;
    while (this.pos < b.length && isDigit(b[this.pos])) {
      sawDigit = true;
      this.pos++;
    }
    if (this.pos < b.length && b[this.pos] === 46) {
      this.pos++;
      while (this.pos < b.length && isDigit(b[this.pos])) {
        sawDigit = true;
        this.pos++;
      }
    }
    if (!sawDigit) {
      this.pos = start;
      return null;
    }
    if (this.pos < b.length && (b[this.pos] === 101 || b[this.pos] === 69)) {
      const expPos = this.pos;
      this.pos++;
      if (this.pos < b.length && (b[this.pos] === 43 || b[this.pos] === 45))
        this.pos++;
      if (this.pos >= b.length || !isDigit(b[this.pos]))
        this.pos = expPos;
      else
        while (this.pos < b.length && isDigit(b[this.pos]))
          this.pos++;
    }
    const text = latin1Slice(b, start, this.pos);
    const n2 = Number(text);
    if (!Number.isFinite(n2))
      throw new PdfError(`Invalid number ${text} at offset ${start}`);
    return n2;
  }
  readWord() {
    const start = this.pos;
    const b = this.bytes;
    while (this.pos < b.length && isRegular(b[this.pos]))
      this.pos++;
    if (this.pos === start) {
      throw new PdfError(`Unexpected byte ${b[this.pos]} at offset ${this.pos}`);
    }
    return latin1Slice(b, start, this.pos);
  }
};
function encodeLiteral(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/syntax/parser.js
function parseValue(tok, resolve) {
  const t = tok.next();
  switch (t.kind) {
    case "eof":
      throw new PdfError("Unexpected EOF while parsing object");
    case "name":
      return new PdfName(t.value);
    case "string":
      return t.value;
    case "number": {
      const n1 = t.value;
      const t2 = tok.peek();
      if (t2.kind === "number") {
        tok.next();
        const t3 = tok.peek();
        if (t3.kind === "word" && t3.value === "R") {
          tok.next();
          return new PdfRef(n1, t2.value);
        }
        tok.unread(t2);
      }
      return n1;
    }
    case "word":
      if (t.value === "true")
        return true;
      if (t.value === "false")
        return false;
      if (t.value === "null")
        return null;
      throw new PdfError(`Unexpected keyword '${t.value}'`);
    case "dictStart":
      return parseDictOrStream(tok, resolve);
    case "arrayStart":
      return parseArray(tok, resolve);
    default:
      throw new PdfError(`Unexpected token ${t.kind}`);
  }
}
function parseArray(tok, resolve) {
  const items = [];
  for (; ; ) {
    const p = tok.peek();
    if (p.kind === "eof")
      throw new PdfError("Unclosed array");
    if (p.kind === "arrayEnd") {
      tok.next();
      return new PdfArray(items);
    }
    items.push(parseValue(tok, resolve));
  }
}
function parseDictBody(tok, resolve) {
  const dict = new PdfDict();
  for (; ; ) {
    const p = tok.peek();
    if (p.kind === "eof")
      throw new PdfError("Unclosed dictionary");
    if (p.kind === "dictEnd") {
      tok.next();
      return dict;
    }
    const keyTok = tok.next();
    if (keyTok.kind !== "name")
      throw new PdfError("Dictionary key must be a name");
    dict.set(keyTok.value, parseValue(tok, resolve));
  }
}
function parseDictOrStream(tok, resolve) {
  const dict = parseDictBody(tok, resolve);
  const p = tok.peek();
  if (p.kind === "word" && p.value === "stream") {
    tok.next();
    tok.consumeStreamEol();
    const length = resolveLength(dict, resolve);
    const data = tok.readBytes(length);
    tok.skipWhitespaceAndComments();
    const end = tok.next();
    if (end.kind !== "word" || end.value !== "endstream") {
      throw new PdfError(`Expected endstream after stream of length ${length}`);
    }
    return new PdfStream(dict, data);
  }
  return dict;
}
function resolveLength(dict, resolve) {
  const raw = dict.get("Length");
  if (raw === void 0)
    throw new PdfError("Stream dictionary missing /Length");
  if (typeof raw === "number")
    return raw;
  if (raw instanceof PdfRef) {
    if (!resolve)
      throw new PdfError("Stream /Length is an indirect reference but no resolver was provided");
    const v = resolve(raw);
    const n2 = asNum(v);
    if (n2 === void 0)
      throw new PdfError("Stream /Length reference did not resolve to a number");
    return n2;
  }
  throw new PdfError("Stream /Length must be a number");
}
function parseIndirectObject(tok, resolve) {
  const n2 = tok.next();
  const g = tok.next();
  const kw = tok.next();
  if (n2.kind !== "number" || g.kind !== "number" || kw.kind !== "word" || kw.value !== "obj") {
    throw new PdfError(`Expected 'n g obj' at offset ${tok.pos}`);
  }
  const value = parseValue(tok, resolve);
  tok.skipWhitespaceAndComments();
  const end = tok.next();
  if (end.kind !== "word" || end.value !== "endobj") {
    throw new PdfError(`Expected endobj after object ${n2.value} ${g.value}`);
  }
  return { num: n2.value, gen: g.value, value };
}
function parseHeader(bytes) {
  const limit = Math.min(bytes.length, 1024);
  for (let i = 0; i < limit - 5; i++) {
    if (bytes[i] === 37 && bytes[i + 1] === 80 && bytes[i + 2] === 68 && bytes[i + 3] === 70 && bytes[i + 4] === 45) {
      let j = i + 5;
      while (j < bytes.length && bytes[j] !== 13 && bytes[j] !== 10 && bytes[j] !== 32)
        j++;
      const version = new TextDecoder("latin1").decode(bytes.subarray(i + 5, j));
      if (!/^\d+\.\d+$/.test(version)) {
        throw new PdfError(`Malformed PDF header version '${version}'`);
      }
      return { version, offset: i };
    }
  }
  throw new PdfError("Missing %PDF- header (not rejected by version, file has no header at all)");
}
function findStartXrefOffset(bytes) {
  const idx = lastIndexOfAscii(bytes, "startxref");
  if (idx < 0)
    throw new PdfError("Missing startxref");
  const tok = new Tokenizer(bytes, idx);
  const kw = tok.next();
  if (kw.kind !== "word" || kw.value !== "startxref")
    throw new PdfError("Failed to parse startxref");
  const n2 = tok.next();
  if (n2.kind !== "number")
    throw new PdfError("startxref is not a number");
  return n2.value;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/filters/ascii.js
function asciiHexDecode(data) {
  const hex = [];
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === 62)
      break;
    if (c <= 32)
      continue;
    const h = fromHex(c);
    if (h < 0)
      throw new PdfError("Invalid ASCIIHexDecode character");
    hex.push(h);
  }
  if (hex.length % 2 === 1)
    hex.push(0);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = hex[i * 2] << 4 | hex[i * 2 + 1];
  return out;
}
function fromHex(c) {
  if (c >= 48 && c <= 57)
    return c - 48;
  if (c >= 65 && c <= 70)
    return c - 65 + 10;
  if (c >= 97 && c <= 102)
    return c - 97 + 10;
  return -1;
}
function ascii85Decode(data) {
  const out = [];
  let i = 0;
  if (data[0] === 60 && data[1] === 126)
    i = 2;
  const tuple = [];
  const flush = (count) => {
    let v = 0;
    for (let k = 0; k < 5; k++)
      v = v * 85 + (tuple[k] ?? 84);
    const bytes = [v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255];
    for (let k = 0; k < count - 1; k++)
      out.push(bytes[k]);
  };
  while (i < data.length) {
    const c = data[i];
    if (c <= 32) {
      i++;
      continue;
    }
    if (c === 126 && data[i + 1] === 62)
      break;
    if (c === 122) {
      if (tuple.length)
        throw new PdfError("Invalid ASCII85 z");
      out.push(0, 0, 0, 0);
      i++;
      continue;
    }
    if (c < 33 || c > 117)
      throw new PdfError("Invalid ASCII85 character");
    tuple.push(c - 33);
    if (tuple.length === 5) {
      flush(5);
      tuple.length = 0;
    }
    i++;
  }
  if (tuple.length) {
    const n2 = tuple.length;
    while (tuple.length < 5)
      tuple.push(84);
    flush(n2);
  }
  return Uint8Array.from(out);
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/filters/inflate.js
function u8of(data) {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}
function adler32(src) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < src.length; i++) {
    a = (a + src[i]) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16 | a) >>> 0;
}
var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
var CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
function makeDecoder(lengths) {
  const count = new Array(16).fill(0);
  for (let i = 0; i < lengths.length; i++) {
    const l = lengths[i];
    if (l) count[l]++;
  }
  const next = new Array(16).fill(0);
  let code = 0;
  for (let bits = 1; bits <= 15; bits++) {
    code = code + count[bits - 1] << 1;
    next[bits] = code;
  }
  const map = /* @__PURE__ */ new Map();
  for (let i = 0; i < lengths.length; i++) {
    const l = lengths[i];
    if (!l) continue;
    map.set(l + ":" + next[l]++, i);
  }
  return function decode(st) {
    let c = 0;
    for (let l = 1; l <= 15; l++) {
      c = c << 1 | bit(st, 1);
      const s = map.get(l + ":" + c);
      if (s !== void 0) return s;
    }
    throw new Error("bad huffman code");
  };
}
function bit(st, n2) {
  while (st.nbuf < n2) {
    if (st.pos >= st.src.length) throw new Error("deflate truncated");
    st.buf |= st.src[st.pos++] << st.nbuf;
    st.nbuf += 8;
  }
  const v = st.buf & (1 << n2) - 1;
  st.buf >>>= n2;
  st.nbuf -= n2;
  return v;
}
function align(st) {
  st.buf = 0;
  st.nbuf = 0;
}
function fixedLitLens() {
  const L = new Array(288);
  for (let i = 0; i <= 143; i++) L[i] = 8;
  for (let i = 144; i <= 255; i++) L[i] = 9;
  for (let i = 256; i <= 279; i++) L[i] = 7;
  for (let i = 280; i <= 287; i++) L[i] = 8;
  return L;
}
function fixedDistLens() {
  return new Array(32).fill(5);
}
function readDynLens(st, n2, decodeCl) {
  const L = new Array(n2).fill(0);
  let i = 0;
  while (i < n2) {
    const sym = decodeCl(st);
    if (sym < 16) {
      L[i++] = sym;
      continue;
    }
    let reps = 0;
    let val = 0;
    if (sym === 16) {
      if (i === 0) throw new Error("bad repeat");
      val = L[i - 1];
      reps = 3 + bit(st, 2);
    } else if (sym === 17) {
      reps = 3 + bit(st, 3);
    } else if (sym === 18) {
      reps = 11 + bit(st, 7);
    } else {
      throw new Error("bad code length");
    }
    while (reps--) L[i++] = val;
  }
  return L;
}
function inflateRaw(data) {
  const st = { src: u8of(data), pos: 0, buf: 0, nbuf: 0 };
  let out = new Uint8Array(Math.max(64, st.src.length * 3));
  let o = 0;
  const push = (b) => {
    if (o >= out.length) {
      const n2 = new Uint8Array(out.length * 2);
      n2.set(out);
      out = n2;
    }
    out[o++] = b;
  };
  const copy = (len, dist) => {
    let from = o - dist;
    if (from < 0) throw new Error("bad distance");
    for (let i = 0; i < len; i++) push(out[from++]);
  };
  const run = (decodeLit, decodeDist) => {
    for (; ; ) {
      const lit = decodeLit(st);
      if (lit < 256) {
        push(lit);
        continue;
      }
      if (lit === 256) return;
      const li = lit - 257;
      if (li < 0 || li >= LEN_BASE.length) throw new Error("bad length");
      const len = LEN_BASE[li] + bit(st, LEN_EXTRA[li]);
      const di = decodeDist(st);
      if (di < 0 || di >= DIST_BASE.length) throw new Error("bad dist");
      copy(len, DIST_BASE[di] + bit(st, DIST_EXTRA[di]));
    }
  };
  for (; ; ) {
    const last = bit(st, 1);
    const type = bit(st, 2);
    if (type === 0) {
      align(st);
      if (st.pos + 4 > st.src.length) throw new Error("stored block truncated");
      const len = st.src[st.pos] | st.src[st.pos + 1] << 8;
      const nlen = st.src[st.pos + 2] | st.src[st.pos + 3] << 8;
      st.pos += 4;
      if ((len ^ 65535) !== nlen) throw new Error("stored nlen mismatch");
      if (st.pos + len > st.src.length) throw new Error("stored data truncated");
      for (let i = 0; i < len; i++) push(st.src[st.pos++]);
    } else if (type === 1) {
      run(makeDecoder(fixedLitLens()), makeDecoder(fixedDistLens()));
    } else if (type === 2) {
      const hlit = bit(st, 5) + 257;
      const hdist = bit(st, 5) + 1;
      const hclen = bit(st, 4) + 4;
      const clens = new Array(19).fill(0);
      for (let i = 0; i < hclen; i++) clens[CL_ORDER[i]] = bit(st, 3);
      const decodeCl = makeDecoder(clens);
      const all = readDynLens(st, hlit + hdist, decodeCl);
      run(makeDecoder(all.slice(0, hlit)), makeDecoder(all.slice(hlit)));
    } else {
      throw new Error("reserved deflate block");
    }
    if (last) break;
  }
  return out.subarray(0, o);
}
function inflateZlib(data) {
  const src = u8of(data);
  if (src.length < 6) throw new Error("zlib too small");
  const cmf = src[0];
  const flg = src[1];
  if ((cmf & 15) !== 8) throw new Error("zlib cm not deflate");
  if (((cmf << 8) + flg) % 31 !== 0) throw new Error("zlib header check");
  let start = 2;
  if (flg & 32) start += 4;
  const raw = src.subarray(start, src.length - 4);
  const out = inflateRaw(raw);
  const adler = (src[src.length - 4] << 24 | src[src.length - 3] << 16 | src[src.length - 2] << 8 | src[src.length - 1]) >>> 0;
  if (adler !== adler32(out)) throw new Error("zlib adler32");
  return out;
}
function deflateZlib(data) {
  const src = u8of(data);
  const blocks = 2 + Math.ceil(Math.max(src.length, 1) / 65535) * (5 + 65535) + 4;
  const out = new Uint8Array(blocks);
  let p = 0;
  out[p++] = 120;
  out[p++] = 1;
  if (src.length === 0) {
    out[p++] = 1;
    out[p++] = 0;
    out[p++] = 0;
    out[p++] = 255;
    out[p++] = 255;
  } else {
    let i = 0;
    while (i < src.length) {
      const n2 = Math.min(65535, src.length - i);
      const last = i + n2 >= src.length;
      out[p++] = last ? 1 : 0;
      out[p++] = n2 & 255;
      out[p++] = n2 >> 8 & 255;
      out[p++] = ~n2 & 255;
      out[p++] = ~n2 >> 8 & 255;
      out.set(src.subarray(i, i + n2), p);
      p += n2;
      i += n2;
    }
  }
  const sum = adler32(src);
  out[p++] = sum >>> 24 & 255;
  out[p++] = sum >>> 16 & 255;
  out[p++] = sum >>> 8 & 255;
  out[p++] = sum & 255;
  return out.subarray(0, p);
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/filters/flate.js
function u8(data) {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}
function flateEncode(data) {
  return deflateZlib(u8(data));
}
function flateDecode(data) {
  const src = u8(data);
  if (src.length >= 2 && (src[0] & 15) === 8 && ((src[0] << 8) + src[1]) % 31 === 0) {
    try {
      return inflateZlib(src);
    } catch {
    }
  }
  try {
    return inflateRaw(src);
  } catch (err) {
    throw new PdfError(`FlateDecode failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/filters/lzw.js
var CLEAR = 256;
var EOD = 257;
function lzwDecode(data, earlyChange = 1) {
  const out = [];
  let bitPos = 0;
  const readBits = (n2) => {
    let v = 0;
    for (let i = 0; i < n2; i++) {
      const byte = data[bitPos >> 3] ?? 0;
      const bit2 = byte >> 7 - (bitPos & 7) & 1;
      v = v << 1 | bit2;
      bitPos++;
    }
    return v;
  };
  let bits = 9;
  let dict = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < 256; i++)
      dict[i] = [i];
    dict[CLEAR] = [];
    dict[EOD] = [];
    bits = 9;
  };
  reset();
  let nextCode = 258;
  let prev = null;
  const bump = () => {
    const limit = earlyChange ? (1 << bits) - 1 : 1 << bits;
    if (nextCode === limit && bits < 12)
      bits++;
  };
  while (bitPos + bits <= data.length * 8) {
    const code = readBits(bits);
    if (code === EOD)
      break;
    if (code === CLEAR) {
      reset();
      nextCode = 258;
      prev = null;
      continue;
    }
    let seq;
    if (code < dict.length && dict[code])
      seq = dict[code];
    else if (code === nextCode && prev)
      seq = [...prev, prev[0]];
    else
      throw new PdfError(`LZWDecode: invalid code ${code}`);
    for (const b of seq)
      out.push(b);
    if (prev) {
      if (nextCode < 4096) {
        dict[nextCode] = [...prev, seq[0]];
        nextCode++;
        bump();
      }
    }
    prev = seq;
  }
  return Uint8Array.from(out);
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/filters/predictor.js
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc)
    return a;
  if (pb <= pc)
    return b;
  return c;
}
function undoPredictor(data, predictor, columns, colors = 1, bitsPerComponent = 8) {
  if (!predictor || predictor <= 1)
    return data;
  const bpp = Math.ceil(colors * bitsPerComponent / 8);
  const rowBytes = Math.ceil(columns * colors * bitsPerComponent / 8);
  if (predictor === 2)
    return undoTiff(data, rowBytes, bpp);
  if (predictor >= 10 && predictor <= 15)
    return undoPng(data, rowBytes, bpp);
  throw new PdfError(`Unsupported predictor ${predictor}`);
}
function undoTiff(data, rowBytes, bpp) {
  const rows = Math.floor(data.length / rowBytes);
  const out = new Uint8Array(rows * rowBytes);
  for (let r = 0; r < rows; r++) {
    const s = r * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const left = i >= bpp ? out[s + i - bpp] : 0;
      out[s + i] = data[s + i] + left & 255;
    }
  }
  return out;
}
function undoPng(data, rowBytes, bpp) {
  const stride = rowBytes + 1;
  const rows = Math.floor(data.length / stride);
  const out = new Uint8Array(rows * rowBytes);
  for (let r = 0; r < rows; r++) {
    const filter = data[r * stride];
    const src = r * stride + 1;
    const dst = r * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const x = data[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = r > 0 ? out[dst - rowBytes + i] : 0;
      const c = r > 0 && i >= bpp ? out[dst - rowBytes + i - bpp] : 0;
      let val = x;
      if (filter === 1)
        val = x + a;
      else if (filter === 2)
        val = x + b;
      else if (filter === 3)
        val = x + (a + b >> 1);
      else if (filter === 4)
        val = x + paeth(a, b, c);
      else if (filter !== 0)
        throw new PdfError(`Unknown PNG filter ${filter}`);
      out[dst + i] = val & 255;
    }
  }
  return out;
}
function predictorParams(parms) {
  const dict = asDict(parms);
  if (!dict)
    return null;
  const predictor = asNum(dict.get("Predictor")) ?? 1;
  if (predictor <= 1)
    return null;
  return {
    predictor,
    columns: asNum(dict.get("Columns")) ?? 1,
    colors: asNum(dict.get("Colors")) ?? 1,
    bitsPerComponent: asNum(dict.get("BitsPerComponent")) ?? 8
  };
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/filters/runlength.js
function runLengthDecode(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const n2 = data[i++];
    if (n2 === 128)
      break;
    if (n2 < 128) {
      const count = n2 + 1;
      for (let k = 0; k < count && i < data.length; k++)
        out.push(data[i++]);
    } else {
      const count = 257 - n2;
      const b = data[i++] ?? 0;
      for (let k = 0; k < count; k++)
        out.push(b);
    }
  }
  return Uint8Array.from(out);
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/filters/decode.js
function filterNames(filter) {
  if (filter === void 0)
    return [];
  if (filter instanceof PdfName)
    return [filter.value];
  if (filter instanceof PdfArray) {
    return filter.items.map((item) => {
      const n2 = asName(item);
      if (!n2)
        throw new PdfError("Filter array must contain names");
      return n2;
    });
  }
  throw new PdfError("Filter must be a name or array of names");
}
function decodeParmsAt(stream, index, count) {
  const raw = stream.dict.get("DecodeParms") ?? stream.dict.get("DP");
  if (raw === void 0)
    return void 0;
  if (raw instanceof PdfArray)
    return raw.items[index];
  if (count === 1)
    return raw;
  return asDict(raw) ? raw : void 0;
}
function decodeStream(stream, decrypt) {
  let data = stream.data;
  if (decrypt)
    data = decrypt(data);
  const filters = filterNames(stream.dict.get("Filter"));
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    const parms = decodeParmsAt(stream, i, filters.length);
    if (f === "Crypt")
      continue;
    if (f === "FlateDecode" || f === "Fl") {
      data = flateDecode(data);
      const pred = predictorParams(parms);
      if (pred)
        data = undoPredictor(data, pred.predictor, pred.columns, pred.colors, pred.bitsPerComponent);
      continue;
    }
    if (f === "ASCIIHexDecode" || f === "AHx") {
      data = asciiHexDecode(data);
      continue;
    }
    if (f === "ASCII85Decode" || f === "A85") {
      data = ascii85Decode(data);
      continue;
    }
    if (f === "LZWDecode" || f === "LZW") {
      const dict = asDict(parms);
      const early = dict && typeof dict.get("EarlyChange") === "number" ? dict.get("EarlyChange") : 1;
      data = lzwDecode(data, early);
      const pred = predictorParams(parms);
      if (pred)
        data = undoPredictor(data, pred.predictor, pred.columns, pred.colors, pred.bitsPerComponent);
      continue;
    }
    if (f === "RunLengthDecode" || f === "RL") {
      data = runLengthDecode(data);
      continue;
    }
    if (f === "DCTDecode" || f === "DCT" || f === "JPXDecode" || f === "CCITTFaxDecode" || f === "JBIG2Decode") {
      return data;
    }
    throw new PdfError(`Unsupported filter: ${f}`);
  }
  return data;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/syntax/xref.js
function skipWs(bytes, pos) {
  while (pos < bytes.length) {
    const c = bytes[pos];
    if (isWhitespace(c)) {
      pos++;
      continue;
    }
    if (c === 37) {
      pos++;
      while (pos < bytes.length && bytes[pos] !== CR && bytes[pos] !== LF)
        pos++;
      continue;
    }
    break;
  }
  return pos;
}
function startsWith(bytes, pos, ascii) {
  if (pos + ascii.length > bytes.length)
    return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[pos + i] !== ascii.charCodeAt(i))
      return false;
  }
  return true;
}
function readLine(bytes, pos) {
  const start = pos;
  while (pos < bytes.length && bytes[pos] !== CR && bytes[pos] !== LF)
    pos++;
  const line = latin1Slice(bytes, start, pos);
  if (pos < bytes.length && bytes[pos] === CR) {
    pos++;
    if (pos < bytes.length && bytes[pos] === LF)
      pos++;
  } else if (pos < bytes.length && bytes[pos] === LF)
    pos++;
  return { line, pos };
}
function readUint(bytes, pos) {
  pos = skipWs(bytes, pos);
  const start = pos;
  if (pos < bytes.length && (bytes[pos] === 43 || bytes[pos] === 45))
    pos++;
  if (pos >= bytes.length || !isDigit(bytes[pos])) {
    throw new PdfError(`Expected integer in xref at offset ${start}`);
  }
  while (pos < bytes.length && isDigit(bytes[pos]))
    pos++;
  return { value: Number(latin1Slice(bytes, start, pos)), pos };
}
function parseClassicXref(bytes, offset) {
  let pos = skipWs(bytes, offset);
  if (!startsWith(bytes, pos, "xref")) {
    throw new PdfError(`Expected xref table at offset ${offset}`);
  }
  pos += 4;
  const entries = /* @__PURE__ */ new Map();
  for (; ; ) {
    pos = skipWs(bytes, pos);
    if (startsWith(bytes, pos, "trailer")) {
      pos += 7;
      const tok = new Tokenizer(bytes, pos);
      const trailer = parseValue(tok);
      if (!(trailer instanceof PdfDict))
        throw new PdfError("Trailer is not a dictionary");
      return { entries, trailer };
    }
    const first = readUint(bytes, pos);
    const count = readUint(bytes, first.pos);
    pos = count.pos;
    while (pos < bytes.length && bytes[pos] !== CR && bytes[pos] !== LF)
      pos++;
    if (pos < bytes.length && bytes[pos] === CR) {
      pos++;
      if (pos < bytes.length && bytes[pos] === LF)
        pos++;
    } else if (pos < bytes.length && bytes[pos] === LF)
      pos++;
    for (let i = 0; i < count.value; i++) {
      const row = readLine(bytes, pos);
      pos = row.pos;
      const m = row.line.trim().match(/^(\d+)\s+(\d+)\s+([nf])/i);
      if (!m)
        throw new PdfError(`Malformed xref entry '${row.line}'`);
      entries.set(first.value + i, {
        offset: Number(m[1]),
        gen: Number(m[2]),
        inUse: m[3].toLowerCase() === "n"
      });
    }
  }
}
function parseXrefStream(bytes, offset) {
  const tok = new Tokenizer(bytes, offset);
  const parsed = parseIndirectObject(tok);
  if (!(parsed.value instanceof PdfStream))
    throw new PdfError("Cross-reference stream is not a stream");
  const stream = parsed.value;
  const trailer = stream.dict;
  const type = asName(trailer.get("Type"));
  if (type && type !== "XRef")
    throw new PdfError("Expected /Type /XRef stream");
  const decoded = decodeStream(stream);
  const wObj = asArray(trailer.get("W"));
  if (!wObj || wObj.items.length < 3)
    throw new PdfError("XRef stream missing /W");
  const w0 = asNum(wObj.items[0]) ?? 0;
  const w1 = asNum(wObj.items[1]) ?? 0;
  const w2 = asNum(wObj.items[2]) ?? 0;
  const entrySize = w0 + w1 + w2;
  if (entrySize <= 0)
    throw new PdfError("Invalid XRef /W");
  const indexPairs = [];
  const index = asArray(trailer.get("Index"));
  if (index) {
    for (const item of index.items) {
      const n2 = asNum(item);
      if (n2 === void 0)
        throw new PdfError("Invalid XRef /Index");
      indexPairs.push(n2);
    }
  } else {
    indexPairs.push(0, asNum(trailer.get("Size")) ?? Math.floor(decoded.length / entrySize));
  }
  const entries = /* @__PURE__ */ new Map();
  let cursor = 0;
  for (let p = 0; p < indexPairs.length; p += 2) {
    const first = indexPairs[p];
    const count = indexPairs[p + 1];
    for (let i = 0; i < count; i++) {
      if (cursor + entrySize > decoded.length)
        throw new PdfError("XRef stream truncated");
      let pos = cursor;
      const typeCode = w0 === 0 ? 1 : readUintBe(decoded, pos, w0);
      pos += w0;
      const f2 = w1 === 0 ? 0 : readUintBe(decoded, pos, w1);
      pos += w1;
      const f3 = w2 === 0 ? 0 : readUintBe(decoded, pos, w2);
      cursor += entrySize;
      const objNum = first + i;
      if (typeCode === 0) {
        entries.set(objNum, { offset: f2, gen: f3, inUse: false });
      } else if (typeCode === 1) {
        entries.set(objNum, { offset: f2, gen: f3, inUse: true });
      } else if (typeCode === 2) {
        entries.set(objNum, {
          offset: 0,
          gen: 0,
          inUse: true,
          compressed: { streamObjNum: f2, index: f3 }
        });
      }
    }
  }
  return { entries, trailer };
}
function parseXrefSection(bytes, offset) {
  const pos = skipWs(bytes, offset);
  if (pos < bytes.length && isDigit(bytes[pos]))
    return parseXrefStream(bytes, pos);
  return parseClassicXref(bytes, pos);
}
function loadXref(bytes) {
  let offset = findStartXrefOffset(bytes);
  const merged = /* @__PURE__ */ new Map();
  let trailer = null;
  const seen = /* @__PURE__ */ new Set();
  while (offset !== null && !seen.has(offset)) {
    seen.add(offset);
    const section = parseXrefSection(bytes, offset);
    const stmOff = asNum(section.trailer.get("XRefStm"));
    if (stmOff !== void 0 && !seen.has(stmOff)) {
      try {
        const extra = parseXrefStream(bytes, stmOff);
        for (const [num, ent] of extra.entries) {
          if (!section.entries.has(num))
            section.entries.set(num, ent);
        }
      } catch {
      }
    }
    for (const [num, ent] of section.entries) {
      if (!merged.has(num))
        merged.set(num, ent);
    }
    if (!trailer)
      trailer = section.trailer;
    const prev = asNum(section.trailer.get("Prev"));
    offset = prev === void 0 ? null : prev;
  }
  if (!trailer)
    throw new PdfError("Missing trailer dictionary");
  return { entries: merged, trailer };
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/syntax/objstm.js
function parseObjectStream(stream) {
  const n2 = asNum(stream.dict.get("N"));
  const first = asNum(stream.dict.get("First"));
  if (n2 === void 0 || first === void 0)
    throw new PdfError("ObjStm missing /N or /First");
  const decoded = decodeStream(stream);
  const tok = new Tokenizer(decoded, 0);
  const pairs = [];
  for (let i = 0; i < n2; i++) {
    const numTok = tok.next();
    const offTok = tok.next();
    if (numTok.kind !== "number" || offTok.kind !== "number") {
      throw new PdfError("ObjStm header is not number pairs");
    }
    pairs.push({ num: numTok.value, offset: offTok.value });
  }
  const out = [];
  for (const pair of pairs) {
    const objTok = new Tokenizer(decoded, first + pair.offset);
    out.push({ num: pair.num, value: parseValue(objTok) });
  }
  return out;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/syntax/repair.js
function isObjKeyword(bytes, pos) {
  if (pos + 3 > bytes.length)
    return false;
  return bytes[pos] === 111 && bytes[pos + 1] === 98 && bytes[pos + 2] === 106;
}
function repairXref(bytes) {
  const entries = /* @__PURE__ */ new Map();
  let i = 0;
  while (i < bytes.length) {
    if (!isDigit(bytes[i])) {
      i++;
      continue;
    }
    const numStart = i;
    while (i < bytes.length && isDigit(bytes[i]))
      i++;
    const numEnd = i;
    if (numEnd === numStart || i >= bytes.length || !isWhitespace(bytes[i])) {
      i = numStart + 1;
      continue;
    }
    while (i < bytes.length && isWhitespace(bytes[i]))
      i++;
    if (i >= bytes.length || !isDigit(bytes[i])) {
      i = numStart + 1;
      continue;
    }
    const genStart = i;
    while (i < bytes.length && isDigit(bytes[i]))
      i++;
    const genEnd = i;
    if (genEnd === genStart || i >= bytes.length || !isWhitespace(bytes[i])) {
      i = numStart + 1;
      continue;
    }
    while (i < bytes.length && isWhitespace(bytes[i]))
      i++;
    if (!isObjKeyword(bytes, i)) {
      i = numStart + 1;
      continue;
    }
    const prev = numStart === 0 ? 10 : bytes[numStart - 1];
    if (numStart > 0 && !isWhitespace(prev) && prev !== 62) {
      i = numStart + 1;
      continue;
    }
    const num = Number(latin1Slice(bytes, numStart, numEnd));
    const gen = Number(latin1Slice(bytes, genStart, genEnd));
    if (!Number.isFinite(num) || num < 1) {
      i = numStart + 1;
      continue;
    }
    entries.set(num, { offset: numStart, gen: Number.isFinite(gen) ? gen : 0, inUse: true });
    i += 3;
  }
  let catalogNum = null;
  for (const [num, ent] of entries) {
    const window = latin1Slice(bytes, ent.offset, ent.offset + 400);
    if (!/\/Type\s*\/Catalog\b/.test(window))
      continue;
    try {
      const tok = new Tokenizer(bytes, ent.offset);
      const parsed = parseIndirectObject(tok);
      if (parsed.value instanceof PdfDict && asName(parsed.value.get("Type")) === "Catalog") {
        catalogNum = num;
        break;
      }
    } catch {
      catalogNum = num;
      break;
    }
  }
  if (catalogNum === null)
    throw new PdfError("Repair scan could not find a Catalog");
  const size = Math.max(...entries.keys(), catalogNum) + 1;
  entries.set(0, { offset: 0, gen: 65535, inUse: false });
  const trailer = new PdfDict().set("Size", size).set("Root", new PdfRef(catalogNum, entries.get(catalogNum)?.gen ?? 0));
  return { entries, trailer };
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/content/parse.js
var INLINE_END = [69, 73];
function parseContent(bytes) {
  const tok = new Tokenizer(bytes, 0);
  const ops = [];
  let args = [];
  for (; ; ) {
    const p = tok.peek();
    if (p.kind === "eof")
      break;
    if (p.kind === "word" && p.value !== "true" && p.value !== "false" && p.value !== "null") {
      tok.next();
      if (p.value === "BI") {
        ops.push(parseInlineImage(tok));
        args = [];
        continue;
      }
      ops.push({ op: p.value, args });
      args = [];
      continue;
    }
    args.push(parseValue(tok));
  }
  if (args.length) {
  }
  return ops;
}
function parseInlineImage(tok) {
  const dict = new PdfDict();
  for (; ; ) {
    const p = tok.peek();
    if (p.kind === "eof")
      throw new PdfError("Unclosed inline image");
    if (p.kind === "word" && p.value === "ID") {
      tok.next();
      tok.consumeStreamEol();
      const data = readUntilEI(tok);
      return { op: "BI", args: [dict, data.length] };
    }
    const key = tok.next();
    if (key.kind !== "name")
      throw new PdfError("Inline image key must be a name");
    dict.set(key.value, parseValue(tok));
  }
}
function readUntilEI(tok) {
  const bytes = tok.bytes;
  let i = tok.pos;
  while (i < bytes.length - 1) {
    if (bytes[i] === INLINE_END[0] && bytes[i + 1] === INLINE_END[1]) {
      const prev = i === 0 ? 32 : bytes[i - 1];
      const next = bytes[i + 2];
      if ((prev <= 32 || prev === 0) && (next === void 0 || next <= 32)) {
        const data = bytes.subarray(tok.pos, i);
        tok.pos = i + 2;
        return data;
      }
    }
    i++;
  }
  throw new PdfError("Inline image missing EI");
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/fonts/tounicode.js
function latin1(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++)
    s += String.fromCharCode(bytes[i]);
  return s;
}
function hexToBytes(hex) {
  const h = hex.replace(/\s/g, "");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16) || 0;
  return out;
}
function utf16BeToString(bytes) {
  let s = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const c = bytes[i] << 8 | bytes[i + 1];
    if (c >= 55296 && c <= 56319 && i + 3 < bytes.length) {
      const d = bytes[i + 2] << 8 | bytes[i + 3];
      if (d >= 56320 && d <= 57343) {
        s += String.fromCodePoint(65536 + (c - 55296 << 10) + (d - 56320));
        i += 2;
        continue;
      }
    }
    if (c)
      s += String.fromCharCode(c);
  }
  return s;
}
function parseBfchar(body, map) {
  const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
  let m;
  while (m = re.exec(body))
    map.set(parseInt(m[1], 16), utf16BeToString(hexToBytes(m[2])));
}
function incrementDest(dest) {
  const next = dest.slice();
  for (let i = next.length - 1; i >= 0; i--) {
    next[i] = next[i] + 1 & 255;
    if (next[i] !== 0)
      break;
  }
  return next;
}
function parseBfrange(body, map) {
  const arrayRange = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/g;
  let m;
  while (m = arrayRange.exec(body)) {
    const lo = parseInt(m[1], 16);
    const dests = [];
    const inner = /<([0-9A-Fa-f]+)>/g;
    let d;
    while (d = inner.exec(m[3]))
      dests.push(utf16BeToString(hexToBytes(d[1])));
    for (let i = 0; i < dests.length; i++)
      map.set(lo + i, dests[i]);
  }
  const incRange = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
  while (m = incRange.exec(body)) {
    if (body.slice(m.index, m.index + m[0].length).includes("["))
      continue;
    const lo = parseInt(m[1], 16);
    const hi = parseInt(m[2], 16);
    let dest = hexToBytes(m[3]);
    for (let cid = lo; cid <= hi; cid++) {
      map.set(cid, utf16BeToString(dest));
      dest = incrementDest(dest);
    }
  }
}
function parseToUnicode(bytes) {
  const text = latin1(bytes);
  const map = /* @__PURE__ */ new Map();
  const charParts = text.split("beginbfchar");
  for (let i = 1; i < charParts.length; i++)
    parseBfchar(charParts[i].split("endbfchar")[0] || "", map);
  const rangeParts = text.split("beginbfrange");
  for (let i = 1; i < rangeParts.length; i++)
    parseBfrange(rangeParts[i].split("endbfrange")[0] || "", map);
  return map;
}
function decodeShowString(font, str) {
  const b = str.bytes;
  if (font?.isCid) {
    let out = "";
    for (let i = 0; i + 1 < b.length; i += 2) {
      const cid = b[i] << 8 | b[i + 1];
      out += font.toUnicode?.get(cid) || "";
    }
    return out.replace(/\s+$/g, "");
  }
  if (b.length >= 2 && b[0] === 254 && b[1] === 255) {
    let out = "";
    for (let i = 2; i + 1 < b.length; i += 2) {
      const c = b[i] << 8 | b[i + 1];
      if (c)
        out += String.fromCharCode(c);
    }
    return out.replace(/\s+$/g, "");
  }
  return str.asLatin1().replace(/\s+$/g, "");
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/fonts/metrics.js
var DEFAULT_ASCENT = 905;
var DEFAULT_DESCENT = -212;
var DEFAULT_WIDTH = 500;
function loadFontMetrics(fontDict, resolve, resourceKey) {
  const baseFont = asName(fontDict.get("BaseFont")) ?? resourceKey;
  const firstChar = asNum(fontDict.get("FirstChar")) ?? 0;
  const lastChar = asNum(fontDict.get("LastChar")) ?? 255;
  let missingWidth = DEFAULT_WIDTH;
  const widths = [];
  const wArr = fontDict.get("Widths");
  if (wArr instanceof PdfArray) {
    for (let i = 0; i < wArr.items.length; i++) {
      widths[firstChar + i] = asNum(wArr.items[i]) ?? missingWidth;
    }
  }
  let ascent = DEFAULT_ASCENT;
  let descent = DEFAULT_DESCENT;
  const descRaw = fontDict.get("FontDescriptor");
  if (descRaw) {
    const desc = asDict(resolve(descRaw));
    if (desc)
      applyDescriptor(desc, (a, d, mw) => {
        if (a !== void 0)
          ascent = a;
        if (d !== void 0)
          descent = d;
        if (mw !== void 0)
          missingWidth = mw;
      });
  }
  const descendants = fontDict.get("DescendantFonts");
  let isCid = asName(fontDict.get("Subtype")) === "Type0" || asName(fontDict.get("Encoding")) === "Identity-H";
  if (descendants instanceof PdfArray && descendants.items[0]) {
    isCid = true;
    const cid = asDict(resolve(descendants.items[0]));
    if (cid) {
      const dw = asNum(cid.get("DW"));
      if (dw !== void 0)
        missingWidth = dw;
      const cidDesc = cid.get("FontDescriptor");
      if (cidDesc) {
        const nested = asDict(resolve(cidDesc));
        if (nested)
          applyDescriptor(nested, (a, d, mw) => {
            if (a !== void 0)
              ascent = a;
            if (d !== void 0)
              descent = d;
            if (mw !== void 0)
              missingWidth = mw;
          });
      }
    }
  }
  let toUnicode = /* @__PURE__ */ new Map();
  const tu = fontDict.get("ToUnicode");
  if (tu) {
    const stm = resolve(tu);
    if (stm instanceof PdfStream) {
      try {
        toUnicode = parseToUnicode(decodeStream(stm));
      } catch {
        toUnicode = /* @__PURE__ */ new Map();
      }
    }
  }
  return { resourceKey, baseFont, firstChar, lastChar, widths, missingWidth, ascent, descent, isCid, toUnicode };
}
function applyDescriptor(desc, set) {
  set(asNum(desc.get("Ascent")), asNum(desc.get("Descent")), asNum(desc.get("MissingWidth")));
}
function glyphWidth(font, charCode) {
  if (!font)
    return DEFAULT_WIDTH;
  const w = font.widths[charCode];
  if (w !== void 0 && Number.isFinite(w))
    return w;
  return font.missingWidth;
}
function stringWidthEm(font, bytes) {
  let w = 0;
  if (font?.isCid) {
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const cid = bytes[i] << 8 | bytes[i + 1];
      w += glyphWidth(font, cid);
    }
    return w;
  }
  for (let i = 0; i < bytes.length; i++)
    w += glyphWidth(font, bytes[i]);
  return w;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/fonts/meta.js
function fontIdFromBaseName(baseName) {
  const raw = String(baseName || "Font").replace(/^.*\+/, "");
  const safe = raw.replace(/[^A-Za-z0-9_-]+/g, "_") || "Font";
  return `pdfimp_${safe}`;
}
function fontDataKey(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const n2 = bytes.length;
  let h = n2 >>> 0;
  h = Math.imul(h ^ bytes[0], 16777619);
  h = Math.imul(h ^ bytes[n2 - 1], 16777619);
  const step = n2 > 2048 ? n2 >>> 8 || 1 : 17;
  for (let i = 1; i < n2; i += step) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  return (h >>> 0).toString(16);
}
function paintFontFamily(baseName, data) {
  const id = fontIdFromBaseName(baseName);
  if (!data || data.length < 100) return id;
  return `${id}_${fontDataKey(data)}`;
}
function mapPdfFontFamily(fontName) {
  const lower = String(fontName || "").replace(/^.*\+/, "").toLowerCase();
  if (lower.includes("myriad")) return "Arial";
  if (lower.includes("minion")) return "Times New Roman";
  if (lower.includes("yahei") || lower.includes("msyh") || lower.includes("\u5FAE\u8F6F\u96C5\u9ED1")) return "Microsoft YaHei";
  if (lower.includes("jhenghei") || lower.includes("msjh") || lower.includes("\u5FAE\u8F6F\u6B63\u9ED1\u4F53")) return "Microsoft JhengHei";
  if (lower.includes("dengxian") || lower.includes("\u7B49\u7EBF")) return "DengXian";
  if (lower.includes("malgun")) return "Malgun Gothic";
  if (lower.includes("yugothic") || lower.includes("yu gothic")) return "Yu Gothic";
  if (lower.includes("kaiti") || lower.includes("adobekai") || lower.includes("\u6977\u4F53")) return "KaiTi";
  if (lower.includes("fangsong") || lower.includes("\u4EFF\u5B8B")) return "FangSong";
  if (lower.includes("simhei") || lower.includes("heiti") || lower.includes("\u9ED1\u4F53")) return "SimHei";
  if (lower.includes("simsun") || lower.includes("stsong") || lower.includes("adobesong") || lower.includes("\u5B8B\u4F53")) {
    return "SimSun";
  }
  if (lower.includes("arialblack") || lower.includes("arial-black") || lower.includes("arial black")) return "Arial Black";
  if (lower.includes("arialnarrow") || lower.includes("arial-narrow") || lower.includes("arial narrow")) return "Arial Narrow";
  if (lower.includes("centurygothic") || lower.includes("century gothic")) return "Century Gothic";
  if (lower.includes("franklin")) return "Franklin Gothic Medium";
  if (lower.includes("comicsans") || lower.includes("comic sans")) return "Comic Sans MS";
  if (lower.includes("palatino")) return "Palatino Linotype";
  if (lower.includes("bookantiqua") || lower.includes("book antiqua") || lower.includes("bookos")) return "Book Antiqua";
  if (lower.includes("garamond")) return "Garamond";
  if (lower.includes("calibri")) return "Calibri";
  if (lower.includes("cambria")) return "Cambria";
  if (lower.includes("georgia")) return "Georgia";
  if (lower.includes("verdana")) return "Verdana";
  if (lower.includes("tahoma")) return "Tahoma";
  if (lower.includes("trebuchet")) return "Trebuchet MS";
  if (lower.includes("segoe") && lower.includes("symbol")) return "Segoe UI Symbol";
  if (lower.includes("segoe")) return "Segoe UI";
  if (lower.includes("consolas")) return "Consolas";
  if (lower.includes("lucida") && lower.includes("console")) return "Lucida Console";
  if (lower.includes("lucida")) return "Lucida Sans Unicode";
  if (lower.includes("candara")) return "Candara";
  if (lower.includes("constantia")) return "Constantia";
  if (lower.includes("corbel")) return "Corbel";
  if (lower.includes("impact")) return "Impact";
  if (lower.includes("webding")) return "Webdings";
  if (lower.includes("wingding") || lower.includes("zapf") || lower.includes("dingbat")) return "Wingdings";
  if (lower === "symbol" || /(^|[^a-z])symbol([^a-z]|$)/.test(lower)) return "Symbol";
  if (lower.includes("courier")) return "Courier New";
  if (lower.includes("times") || lower.includes("roman")) return "Times New Roman";
  if (lower.includes("helvetica") || lower.includes("arial")) return "Arial";
  if (lower.includes("song")) return "SimSun";
  if (lower.includes("gothic") || lower.includes("hei")) return "SimHei";
  if (lower.includes("sans")) return "Arial";
  return "Arial";
}
function mapBaseFontMeta(baseName) {
  const n2 = String(baseName || "");
  const family = mapPdfFontFamily(n2);
  const arialBlack = /arial.?black/i.test(n2);
  const weight = arialBlack ? "normal" : /bold|black|heavy|semibold/i.test(n2) ? "bold" : "normal";
  const style = /italic|oblique|[-_](?:bold)?it$/i.test(n2) ? "italic" : "normal";
  return { family, weight, style };
}
function sniffSfntFormat(bytes) {
  if (!bytes || bytes.length < 4) return "unknown";
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) return "ttf";
  if (b[0] === 116 && b[1] === 114 && b[2] === 117 && b[3] === 101) return "ttf";
  if (b[0] === 79 && b[1] === 84 && b[2] === 84 && b[3] === 79) return "otf";
  if (b[0] === 1 && b[1] === 0) return "cff";
  return "unknown";
}
function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined")
    return Buffer.from(bytes).toString("base64");
  let binary = "";
  const chunk2 = 32768;
  for (let i = 0; i < bytes.length; i += chunk2) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk2));
  }
  return btoa(binary);
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/images/png.js
function crc32(bytes) {
  let c = ~0 >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++)
      c = c >>> 1 ^ 3988292384 & -(c & 1);
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const len = data.length;
  out[0] = len >>> 24 & 255;
  out[1] = len >>> 16 & 255;
  out[2] = len >>> 8 & 255;
  out[3] = len & 255;
  for (let i = 0; i < 4; i++)
    out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcSrc = out.subarray(4, 8 + data.length);
  const crc = crc32(crcSrc);
  const t = 8 + data.length;
  out[t] = crc >>> 24 & 255;
  out[t + 1] = crc >>> 16 & 255;
  out[t + 2] = crc >>> 8 & 255;
  out[t + 3] = crc & 255;
  return out;
}
function encodePng(width, height, samples, channels = 3) {
  const stride = width * channels + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    const src = y * width * channels;
    raw.set(samples.subarray(src, src + width * channels), y * stride + 1);
  }
  const ihdr = new Uint8Array(13);
  ihdr[0] = width >>> 24 & 255;
  ihdr[1] = width >>> 16 & 255;
  ihdr[2] = width >>> 8 & 255;
  ihdr[3] = width & 255;
  ihdr[4] = height >>> 24 & 255;
  ihdr[5] = height >>> 16 & 255;
  ihdr[6] = height >>> 8 & 255;
  ihdr[7] = height & 255;
  ihdr[8] = 8;
  ihdr[9] = channels === 1 ? 0 : 2;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = chunk("IDAT", flateEncode(raw));
  const iend = chunk("IEND", new Uint8Array());
  const ihdrChunk = chunk("IHDR", ihdr);
  const out = new Uint8Array(sig.length + ihdrChunk.length + idat.length + iend.length);
  out.set(sig, 0);
  out.set(ihdrChunk, sig.length);
  out.set(idat, sig.length + ihdrChunk.length);
  out.set(iend, sig.length + ihdrChunk.length + idat.length);
  return out;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/images/raster.js
function filterNames2(obj) {
  const raw = obj.dict.get("Filter");
  const one = asName(raw);
  if (one)
    return [one];
  if (raw instanceof PdfArray)
    return raw.items.map((i) => asName(i)).filter(Boolean);
  return [];
}
function colorSpaceName(obj) {
  const cs = obj.dict.get("ColorSpace");
  const name = asName(cs);
  if (name)
    return name;
  if (cs instanceof PdfArray && cs.items.length)
    return asName(cs.items[0]);
  return null;
}
function decodeImageXObject(obj) {
  if (!(obj instanceof PdfStream))
    return null;
  const width = asNum(obj.dict.get("Width"));
  const height = asNum(obj.dict.get("Height"));
  if (!width || !height)
    return null;
  const names = filterNames2(obj);
  if (names.includes("DCTDecode") || names.includes("DCT")) {
    return {
      width,
      height,
      dataUrl: `data:image/jpeg;base64,${bytesToBase64(obj.data)}`
    };
  }
  let samples;
  try {
    samples = decodeStream(obj);
  } catch {
    return null;
  }
  const bpc = asNum(obj.dict.get("BitsPerComponent")) ?? 8;
  if (bpc !== 8)
    return null;
  const cs = colorSpaceName(obj);
  if (cs === "DeviceGray" || cs === "G" || cs === "CalGray") {
    if (samples.length < width * height)
      return null;
    const gray = samples.subarray(0, width * height);
    const png = encodePng(width, height, gray, 1);
    return {
      width,
      height,
      dataUrl: `data:image/png;base64,${bytesToBase64(png)}`
    };
  }
  if (cs === "DeviceRGB" || cs === "RGB" || cs === "CalRGB" || cs === "ICCBased" || !cs) {
    if (samples.length < width * height * 3)
      return null;
    const rgb = samples.subarray(0, width * height * 3);
    const png = encodePng(width, height, rgb, 3);
    return {
      width,
      height,
      dataUrl: `data:image/png;base64,${bytesToBase64(png)}`
    };
  }
  return null;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/content/color.js
function cmykToRgb(c, m, y, k) {
  return [
    1 - Math.min(1, c + k),
    1 - Math.min(1, m + k),
    1 - Math.min(1, y + k)
  ];
}
function toByte(n2) {
  const v = n2 <= 1 ? n2 * 255 : n2;
  return Math.max(0, Math.min(255, Math.round(v)));
}
function rgbToHex(rgb, { exact = false } = {}) {
  const r = toByte(rgb[0]);
  const g = toByte(rgb[1]);
  const b = toByte(rgb[2]);
  if (!exact && r <= 24 && g <= 24 && b <= 24)
    return "#000000";
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
function componentsToRgb(kind, comps) {
  if (kind === "gray" || comps.length === 1) {
    const g2 = comps[0] ?? 0;
    return [g2, g2, g2];
  }
  if (kind === "cmyk" || comps.length === 4) {
    return cmykToRgb(comps[0] ?? 0, comps[1] ?? 0, comps[2] ?? 0, comps[3] ?? 0);
  }
  if (comps.length >= 3)
    return [comps[0] ?? 0, comps[1] ?? 0, comps[2] ?? 0];
  const g = comps[0] ?? 0;
  return [g, g, g];
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/content/matrix.js
function ident() {
  return [1, 0, 0, 1, 0, 0];
}
function cloneMat(m) {
  return [m[0], m[1], m[2], m[3], m[4], m[5]];
}
function matMul(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}
function applyMat(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
function translate(tx, ty) {
  return [1, 0, 0, 1, tx, ty];
}
function bboxOfPoints(pts) {
  if (!pts.length)
    return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX)
      minX = x;
    if (y < minY)
      minY = y;
    if (x > maxX)
      maxX = x;
    if (y > maxY)
      maxY = y;
  }
  if (!Number.isFinite(minX))
    return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
function transformBox(m, x, y, w, h) {
  return bboxOfPoints([
    applyMat(m, x, y),
    applyMat(m, x + w, y),
    applyMat(m, x + w, y + h),
    applyMat(m, x, y + h)
  ]);
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/content/interpret.js
var FILL_OPS = /* @__PURE__ */ new Set(["f", "F", "f*", "B", "B*", "b", "b*"]);
function extractContent(ops, ctx) {
  const interpreted = interpretContent(ops, ctx ?? {
    pageHeight: 0,
    resources: null,
    resolve: (o) => o
  });
  return {
    text: interpreted.textLines.map((l) => l.content).join(""),
    rects: interpreted.paths.map((p) => ({
      x: p.minX,
      y: p.minY,
      width: p.w,
      height: p.h,
      fill: true,
      stroke: false
    })),
    images: interpreted.images.map((i) => ({ name: i.name }))
  };
}
function interpretContent(ops, ctx) {
  const textLines = [];
  const paths = [];
  const images = [];
  const fonts = loadFontMap(ctx.resources, ctx.resolve);
  const stack = [];
  let gs = defaultGs();
  let path = [];
  const fontOf = () => {
    if (!gs.fontKey)
      return null;
    return fonts.get(gs.fontKey) ?? null;
  };
  const show = (str) => {
    const font = fontOf();
    const th = gs.tz / 100;
    const wEm = stringWidthEm(font, str.bytes);
    const user = matMul(gs.ctm, gs.Tm);
    const sx = Math.hypot(user[0], user[1]) * gs.fontSize * th;
    const sy = Math.hypot(user[2], user[3]) * gs.fontSize;
    const fontSize = sy > 0.05 ? sy : sx;
    const scaleX = fontSize > 0 ? sx / fontSize : 1;
    const content = decodeShowString(font, str);
    const ascent = font?.ascent ?? 905;
    const descent = font?.descent ?? -212;
    const ascentPt = fontSize * (ascent / 1e3);
    const hPt = fontSize * ((ascent - descent) / 1e3);
    const wPt = fontSize > 0 ? wEm / 1e3 * sx : 0;
    if (content && fontSize > 0.5) {
      textLines.push({
        content,
        xPt: user[4],
        baselineFromBottom: user[5],
        wPt: Math.max(wPt, fontSize * 0.35 * scaleX),
        hPt: Math.max(hPt, fontSize * 0.5),
        fontSize,
        scaleX: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1,
        color: rgbToHex(gs.fill, { exact: true }),
        fontName: font?.baseFont ?? gs.fontKey ?? "",
        ascentPt
      });
    }
    let extra = 0;
    if (font?.isCid) {
      for (let i = 0; i + 1 < str.bytes.length; i += 2)
        extra += gs.tc;
    } else {
      for (let i = 0; i < str.bytes.length; i++) {
        extra += gs.tc;
        if (str.bytes[i] === 32)
          extra += gs.tw;
      }
    }
    const advance = wEm / 1e3 * gs.fontSize * th + extra * th;
    gs.Tm = matMul(gs.Tm, translate(advance, 0));
  };
  const paintPath = (op) => {
    const fill = FILL_OPS.has(op);
    if (fill && path.length) {
      const pts = path.map(([x, y]) => applyMat(gs.ctm, x, y));
      const box = bboxOfPoints(pts);
      if (box && box.w > 1e-6 && box.h > 1e-6) {
        paths.push({ ...box, fill: rgbToHex(gs.fill, { exact: false }) });
      }
    }
    path = [];
  };
  const td = (tx, ty) => {
    gs.Tlm = matMul(gs.Tlm, translate(tx, ty));
    gs.Tm = cloneMat(gs.Tlm);
  };
  for (const op of ops) {
    const n2 = nums(op.args);
    switch (op.op) {
      case "q":
        stack.push(cloneGs(gs));
        break;
      case "Q": {
        const prev = stack.pop();
        if (prev)
          gs = prev;
        break;
      }
      case "cm":
        if (n2.length >= 6) {
          gs.ctm = matMul(gs.ctm, [n2[0], n2[1], n2[2], n2[3], n2[4], n2[5]]);
        }
        break;
      case "w":
      case "J":
      case "j":
      case "M":
      case "d":
      case "ri":
      case "i":
      case "gs":
        break;
      case "m":
        if (n2.length >= 2)
          path.push([n2[0], n2[1]]);
        break;
      case "l":
        if (n2.length >= 2)
          path.push([n2[0], n2[1]]);
        break;
      case "c":
        if (n2.length >= 6) {
          path.push([n2[0], n2[1]], [n2[2], n2[3]], [n2[4], n2[5]]);
        }
        break;
      case "v":
      case "y":
        if (n2.length >= 4)
          path.push([n2[0], n2[1]], [n2[2], n2[3]]);
        break;
      case "h":
        break;
      case "re":
        if (n2.length >= 4) {
          const x = n2[0];
          const y = n2[1];
          const w = n2[2];
          const h = n2[3];
          path.push([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
        }
        break;
      case "n":
      case "W":
      case "W*":
        path = [];
        break;
      case "f":
      case "F":
      case "f*":
      case "B":
      case "B*":
      case "b":
      case "b*":
      case "S":
      case "s":
        paintPath(op.op);
        break;
      case "cs":
        gs.fillKind = colorKind(op.args[0], ctx);
        break;
      case "CS":
        gs.strokeKind = colorKind(op.args[0], ctx);
        break;
      case "sc":
      case "scn":
        gs.fill = componentsToRgb(gs.fillKind, n2);
        break;
      case "SC":
      case "SCN":
        gs.stroke = componentsToRgb(gs.strokeKind, n2);
        break;
      case "g":
        gs.fillKind = "gray";
        gs.fill = componentsToRgb("gray", n2);
        break;
      case "G":
        gs.strokeKind = "gray";
        gs.stroke = componentsToRgb("gray", n2);
        break;
      case "rg":
        gs.fillKind = "rgb";
        gs.fill = componentsToRgb("rgb", n2);
        break;
      case "RG":
        gs.strokeKind = "rgb";
        gs.stroke = componentsToRgb("rgb", n2);
        break;
      case "k":
        gs.fillKind = "cmyk";
        gs.fill = componentsToRgb("cmyk", n2);
        break;
      case "K":
        gs.strokeKind = "cmyk";
        gs.stroke = componentsToRgb("cmyk", n2);
        break;
      case "BT":
        gs.Tm = ident();
        gs.Tlm = ident();
        break;
      case "ET":
        break;
      case "Tc":
        if (n2[0] !== void 0)
          gs.tc = n2[0];
        break;
      case "Tw":
        if (n2[0] !== void 0)
          gs.tw = n2[0];
        break;
      case "Tz":
        if (n2[0] !== void 0)
          gs.tz = n2[0];
        break;
      case "TL":
        if (n2[0] !== void 0)
          gs.leading = n2[0];
        break;
      case "Tf": {
        const name = asName(op.args[0]);
        const size = asNum(op.args[1]);
        if (name)
          gs.fontKey = name;
        if (size !== void 0)
          gs.fontSize = size;
        break;
      }
      case "Tr":
      case "Ts":
        break;
      case "Td":
        if (n2.length >= 2)
          td(n2[0], n2[1]);
        break;
      case "TD":
        if (n2.length >= 2) {
          gs.leading = -n2[1];
          td(n2[0], n2[1]);
        }
        break;
      case "Tm":
        if (n2.length >= 6) {
          gs.Tm = [n2[0], n2[1], n2[2], n2[3], n2[4], n2[5]];
          gs.Tlm = cloneMat(gs.Tm);
        }
        break;
      case "T*":
        td(0, -gs.leading);
        break;
      case "Tj": {
        const s = asPdfString(op.args[0]);
        if (s)
          show(s);
        break;
      }
      case "'": {
        td(0, -gs.leading);
        const s = asPdfString(op.args[0]);
        if (s)
          show(s);
        break;
      }
      case '"': {
        if (n2.length >= 2) {
          gs.tw = n2[0];
          gs.tc = n2[1];
        }
        td(0, -gs.leading);
        const s = asPdfString(op.args[op.args.length - 1]);
        if (s)
          show(s);
        break;
      }
      case "TJ": {
        const arr = asArray(op.args[0]);
        if (!arr)
          break;
        const th = gs.tz / 100;
        for (const item of arr.items) {
          const s = asPdfString(item);
          if (s) {
            show(s);
            continue;
          }
          const adj = asNum(item);
          if (adj !== void 0) {
            gs.Tm = matMul(gs.Tm, translate(-adj / 1e3 * gs.fontSize * th, 0));
          }
        }
        break;
      }
      case "Do": {
        const name = asName(op.args[0]);
        if (!name)
          break;
        paintXObject(name, gs, ctx, textLines, paths, images);
        break;
      }
      default:
        break;
    }
  }
  return { textLines, paths, images };
}
function defaultGs() {
  return {
    ctm: ident(),
    fill: [0, 0, 0],
    stroke: [0, 0, 0],
    fillKind: "rgb",
    strokeKind: "rgb",
    fontKey: null,
    fontSize: 1,
    tz: 100,
    tc: 0,
    tw: 0,
    leading: 0,
    Tm: ident(),
    Tlm: ident()
  };
}
function cloneGs(gs) {
  return {
    ...gs,
    ctm: cloneMat(gs.ctm),
    fill: [gs.fill[0], gs.fill[1], gs.fill[2]],
    stroke: [gs.stroke[0], gs.stroke[1], gs.stroke[2]],
    Tm: cloneMat(gs.Tm),
    Tlm: cloneMat(gs.Tlm)
  };
}
function nums(args) {
  const out = [];
  for (const a of args) {
    const n2 = asNum(a);
    if (n2 !== void 0)
      out.push(n2);
  }
  return out;
}
function asPdfString(obj) {
  return obj instanceof PdfString ? obj : void 0;
}
function loadFontMap(resources, resolve) {
  const map = /* @__PURE__ */ new Map();
  if (!resources)
    return map;
  const raw = resources.get("Font");
  if (!raw)
    return map;
  const fontDict = asDict(resolve(raw));
  if (!fontDict)
    return map;
  for (const [key, value] of fontDict.entries) {
    const fd = asDict(resolve(value));
    if (!fd)
      continue;
    map.set(key, loadFontMetrics(fd, resolve, key));
  }
  return map;
}
function namedResource(resources, category, name, resolve) {
  if (!resources)
    return void 0;
  const cat = resources.get(category);
  if (!cat)
    return void 0;
  const dict = asDict(resolve(cat));
  if (!dict)
    return void 0;
  const value = dict.get(name);
  return value !== void 0 ? resolve(value) : void 0;
}
function colorKind(arg, ctx) {
  const name = asName(arg);
  if (name === "DeviceRGB" || name === "RGB")
    return "rgb";
  if (name === "DeviceGray" || name === "G")
    return "gray";
  if (name === "DeviceCMYK" || name === "CMYK")
    return "cmyk";
  if (!name)
    return "unknown";
  const cs = namedResource(ctx.resources, "ColorSpace", name, ctx.resolve) ?? arg;
  return colorSpaceKind(cs, ctx.resolve);
}
function colorSpaceKind(cs, resolve) {
  if (cs === void 0)
    return "unknown";
  const name = asName(cs);
  if (name === "DeviceRGB" || name === "RGB")
    return "rgb";
  if (name === "DeviceGray" || name === "G")
    return "gray";
  if (name === "DeviceCMYK" || name === "CMYK")
    return "cmyk";
  const resolved = resolve(cs);
  const arr = asArray(resolved);
  if (!arr || !arr.items.length)
    return "unknown";
  const t = asName(arr.items[0]);
  if (t === "ICCBased") {
    const stm = arr.items[1] !== void 0 ? resolve(arr.items[1]) : void 0;
    const n2 = asNum(asDict(stm)?.get("N"));
    if (n2 === 1)
      return "gray";
    if (n2 === 4)
      return "cmyk";
    return "rgb";
  }
  if (t === "CalRGB" || t === "Lab")
    return "rgb";
  if (t === "CalGray")
    return "gray";
  if (t === "Indexed" && arr.items[1] !== void 0)
    return colorSpaceKind(arr.items[1], resolve);
  return "unknown";
}
function paintXObject(name, gs, ctx, textLines, paths, images) {
  const obj = namedResource(ctx.resources, "XObject", name, ctx.resolve);
  if (!obj) {
    const box = transformBox(gs.ctm, 0, 0, 1, 1);
    if (box && box.w > 1e-6 && box.h > 1e-6)
      images.push({ ...box, name });
    return;
  }
  const dict = asDict(obj);
  const subtype = dict ? asName(dict.get("Subtype")) : void 0;
  if (subtype === "Image" || obj instanceof PdfStream && subtype !== "Form") {
    const box = transformBox(gs.ctm, 0, 0, 1, 1);
    if (!box || box.w <= 1e-6 || box.h <= 1e-6)
      return;
    images.push({ ...box, name, dataUrl: decodeImageXObject(obj)?.dataUrl });
    return;
  }
  if (subtype === "Form" && obj instanceof PdfStream) {
    const depth = ctx.formDepth ?? 0;
    if (depth > 8)
      return;
    const formMatrix = asBoxMatrix(dict?.get("Matrix")) ?? ident();
    const formRes = dict?.get("Resources");
    const nested = interpretContent(parseContent(decodeStream(obj)), {
      pageHeight: ctx.pageHeight,
      resources: formRes ? asDict(ctx.resolve(formRes)) ?? ctx.resources : ctx.resources,
      resolve: ctx.resolve,
      formDepth: depth + 1
    });
    const combined = matMul(gs.ctm, formMatrix);
    remapInterpreted(nested, combined, textLines, paths, images);
  }
}
function remapInterpreted(nested, m, textLines, paths, images) {
  const isIdent = m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
  if (isIdent) {
    textLines.push(...nested.textLines);
    paths.push(...nested.paths);
    images.push(...nested.images);
    return;
  }
  for (const t of nested.textLines) {
    const [x, y] = applyMat(m, t.xPt, t.baselineFromBottom);
    const sx = Math.hypot(m[0], m[1]);
    const sy = Math.hypot(m[2], m[3]);
    textLines.push({
      ...t,
      xPt: x,
      baselineFromBottom: y,
      fontSize: t.fontSize * (sy || sx || 1),
      wPt: t.wPt * (sx || 1),
      hPt: t.hPt * (sy || 1),
      ascentPt: t.ascentPt * (sy || 1)
    });
  }
  for (const p of nested.paths) {
    const box = transformBox(m, p.minX, p.minY, p.w, p.h);
    if (box && box.w > 1e-6 && box.h > 1e-6)
      paths.push({ ...box, fill: p.fill });
  }
  for (const im of nested.images) {
    const box = transformBox(m, im.minX, im.minY, im.w, im.h);
    if (box && box.w > 1e-6 && box.h > 1e-6)
      images.push({ ...im, ...box });
  }
}
function asBoxMatrix(obj) {
  const arr = asArray(obj);
  if (!arr || arr.items.length < 6)
    return void 0;
  const n2 = arr.items.map((i) => asNum(i));
  if (n2.some((v) => v === void 0))
    return void 0;
  return [n2[0], n2[1], n2[2], n2[3], n2[4], n2[5]];
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/fonts/extract.js
function fontFileFromDescriptor(fontDict, resolve) {
  const descObj = fontDict.get("FontDescriptor");
  if (!descObj)
    return null;
  const desc = asDict(resolve(descObj));
  if (!desc)
    return null;
  for (const key of ["FontFile2", "FontFile3", "FontFile"]) {
    const ff = desc.get(key);
    if (!ff)
      continue;
    const resolved = resolve(ff);
    if (resolved instanceof PdfStream) {
      try {
        return decodeStream(resolved);
      } catch {
        return resolved.data;
      }
    }
  }
  return null;
}
function fontFileFromDict(fontDict, resolve) {
  const baseFont = asName(fontDict.get("BaseFont")) ?? null;
  const subtype = asName(fontDict.get("Subtype")) ?? null;
  let data = fontFileFromDescriptor(fontDict, resolve);
  if (!data) {
    const descendants = fontDict.get("DescendantFonts");
    if (descendants instanceof PdfArray && descendants.items[0]) {
      const cid = asDict(resolve(descendants.items[0]));
      if (cid)
        data = fontFileFromDescriptor(cid, resolve);
    }
  }
  return { baseFont, subtype, data };
}
function collectPageFonts(resources, resolve) {
  if (!resources)
    return [];
  const fontObj = resources.get("Font");
  if (!fontObj)
    return [];
  const fontDict = asDict(resolve(fontObj));
  if (!fontDict)
    return [];
  const out = [];
  for (const [key, value] of fontDict.entries) {
    const fd = asDict(resolve(value));
    if (!fd)
      continue;
    out.push({ ...fontFileFromDict(fd, resolve), resourceKey: key });
  }
  return out;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/annot/annots.js
function readAnnotations(annots, resolve) {
  const arr = asArray(annots ? resolve(annots) : void 0);
  if (!arr)
    return [];
  const out = [];
  for (const item of arr.items) {
    const dict = asDict(resolve(item));
    if (!dict)
      continue;
    const rectArr = asArray(dict.get("Rect"));
    let rect = null;
    if (rectArr && rectArr.items.length >= 4) {
      const nums3 = rectArr.items.map((x) => typeof x === "number" ? x : 0);
      rect = [nums3[0], nums3[1], nums3[2], nums3[3]];
    }
    out.push({ subtype: asName(dict.get("Subtype")) ?? null, rect, dict });
  }
  return out;
}
function makeLinkAnnot(rect, uri) {
  const bytes = new Uint8Array(uri.length);
  for (let i = 0; i < uri.length; i++)
    bytes[i] = uri.charCodeAt(i) & 255;
  return new PdfDict().set("Type", pdfName("Annot")).set("Subtype", pdfName("Link")).set("Rect", new PdfArray([...rect])).set("Border", new PdfArray([0, 0, 0])).set("A", new PdfDict().set("S", pdfName("URI")).set("URI", new PdfString(bytes, false)));
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/layout/extract.js
function layoutPage(page) {
  const pageWidthPt = page.width;
  const pageHeightPt = page.height;
  const resources = page.resolvedResources();
  const interpreted = interpretContent(page.contentOperators(), {
    pageHeight: pageHeightPt,
    resources,
    resolve: page.resolve
  });
  const embedded = layoutFonts(page.embeddedFonts ? page.embeddedFonts() : collectPageFonts(resources, page.resolve));
  const fontIdByBaseName = /* @__PURE__ */ new Map();
  for (const f of embedded) {
    fontIdByBaseName.set(f.baseName, f.id);
    const short = f.baseName.replace(/^.*\+/, "");
    if (short)
      fontIdByBaseName.set(short, f.id);
  }
  const textLines = interpreted.textLines.map((t) => {
    const yTopPt = pageHeightPt - (t.baselineFromBottom + t.ascentPt);
    const fontFace = fontIdByBaseName.get(t.fontName) || fontIdByBaseName.get(String(t.fontName || "").replace(/^.*\+/, ""));
    const line = {
      content: t.content,
      xPt: t.xPt,
      baselineFromBottom: t.baselineFromBottom,
      yTopPt,
      wPt: t.wPt,
      hPt: t.hPt,
      fontSize: t.fontSize,
      scaleX: t.scaleX,
      color: t.color,
      fontName: t.fontName
    };
    if (fontFace)
      line.fontFace = fontFace;
    return line;
  });
  textLines.sort((a, b) => a.yTopPt - b.yTopPt || a.xPt - b.xPt);
  return {
    pageWidthPt,
    pageHeightPt,
    textLines,
    paths: interpreted.paths,
    images: interpreted.images.map(({ name, ...rest }) => ({ ...rest, name })),
    embeddedFonts: embedded
  };
}
function layoutFonts(fonts) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const f of fonts) {
    const baseName = f.baseFont || f.resourceKey || "Font";
    if (seen.has(baseName))
      continue;
    if (!f.data || f.data.length < 100)
      continue;
    seen.add(baseName);
    const meta = mapBaseFontMeta(baseName);
    out.push({
      id: fontIdFromBaseName(baseName),
      baseName,
      family: meta.family,
      weight: meta.weight,
      style: meta.style,
      format: sniffSfntFormat(f.data),
      dataBase64: bytesToBase64(f.data)
    });
  }
  return out;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/cos/page.js
var PdfPage = class {
  mediaBox;
  cropBox;
  resources;
  dict;
  ref;
  contents;
  resolve;
  writable;
  ops = [];
  annotDicts = [];
  usedFonts = /* @__PURE__ */ new Set(["F1"]);
  usedImages = /* @__PURE__ */ new Set();
  usedExtG = /* @__PURE__ */ new Set();
  extG = /* @__PURE__ */ new Map();
  fillAlpha = null;
  constructor(mediaBox, cropBox, resources, dict, ref, contents, resolve, writable) {
    this.mediaBox = mediaBox;
    this.cropBox = cropBox;
    this.resources = resources;
    this.dict = dict;
    this.ref = ref;
    this.contents = contents;
    this.resolve = resolve;
    this.writable = writable;
  }
  get width() {
    return this.mediaBox[2] - this.mediaBox[0];
  }
  get height() {
    return this.mediaBox[3] - this.mediaBox[1];
  }
  fonts() {
    const res = this.resolvedResources();
    if (!res)
      return this.writable ? [{ resourceKey: "F1", baseFont: "Helvetica" }] : [];
    const fontObj = res.get("Font");
    if (!fontObj)
      return [];
    const fontDict = asDict(this.resolve(fontObj));
    if (!fontDict)
      return [];
    const out = [];
    for (const [key, value] of fontDict.entries) {
      const fd = asDict(this.resolve(value));
      out.push({
        resourceKey: key,
        baseFont: fd ? asName(fd.get("BaseFont")) ?? null : null
      });
    }
    return out;
  }
  fontBaseNames() {
    return this.fonts().map((f) => f.baseFont).filter((n2) => !!n2);
  }
  fontResourceKeys() {
    return this.fonts().map((f) => f.resourceKey);
  }
  embeddedFonts() {
    if (!this.writable && this._embeddedFonts) return this._embeddedFonts;
    const fonts = collectPageFonts(this.resolvedResources(), this.resolve);
    if (!this.writable) this._embeddedFonts = fonts;
    return fonts;
  }
  drawText(text, opts) {
    this.assertWritable();
    const size = opts.fontSize ?? 12;
    const font = opts.font ?? "F1";
    this.usedFonts.add(font);
    const tz = opts.scaleX !== void 0 ? `${opts.scaleX * 100} Tz ` : "";
    this.ops.push(`BT /${font} ${size} Tf ${tz}${opts.x} ${opts.y} Td (${encodeLiteral(text)}) Tj ET`);
  }
  drawRect(opts) {
    this.assertWritable();
    const fillRgb = paintRgb(opts.fill);
    const strokeRgb = paintRgb(opts.stroke);
    if (!fillRgb && !strokeRgb && opts.lineWidth === void 0)
      return;
    const parts = [];
    if (opts.lineWidth !== void 0)
      parts.push(`${opts.lineWidth} w`);
    if (fillRgb)
      parts.push(`${fillRgb} rg`);
    if (strokeRgb)
      parts.push(`${strokeRgb} RG`);
    parts.push(`${n(opts.x)} ${n(opts.y)} ${n(opts.width)} ${n(opts.height)} re`);
    if (fillRgb && strokeRgb)
      parts.push("B");
    else if (fillRgb)
      parts.push("f");
    else
      parts.push("S");
    this.ops.push(parts.join(" "));
  }
  saveGState() {
    this.assertWritable();
    this.ops.push("q");
  }
  restoreGState() {
    this.assertWritable();
    this.ops.push("Q");
  }
  transform(a, b, c, d, e, f) {
    this.assertWritable();
    this.ops.push(`${n(a)} ${n(b)} ${n(c)} ${n(d)} ${n(e)} ${n(f)} cm`);
  }
  setFillColor(color) {
    this.assertWritable();
    const c = paintRgb(color);
    if (c) this.ops.push(`${c} rg`);
  }
  setStrokeColor(color) {
    this.assertWritable();
    const c = paintRgb(color);
    if (c) this.ops.push(`${c} RG`);
  }
  setLineWidth(width) {
    this.assertWritable();
    this.ops.push(`${n(width)} w`);
  }
  setDash(on, off = on) {
    this.assertWritable();
    if (!on)
      this.ops.push("[] 0 d");
    else
      this.ops.push(`[${n(on)} ${n(off)}] 0 d`);
  }
  moveTo(x, y) {
    this.assertWritable();
    this.ops.push(`${n(x)} ${n(y)} m`);
  }
  lineTo(x, y) {
    this.assertWritable();
    this.ops.push(`${n(x)} ${n(y)} l`);
  }
  stroke() {
    this.assertWritable();
    this.ops.push("S");
  }
  fill() {
    this.assertWritable();
    this.ops.push("f");
  }
  pushOp(op) {
    this.assertWritable();
    this.ops.push(op);
  }
  drawGlyphs(hex, opts) {
    this.assertWritable();
    const size = opts.fontSize ?? 12;
    const font = opts.font ?? "F1";
    this.usedFonts.add(font);
    const tm = opts.matrix;
    const tmPart = tm ? `${n(tm[0])} ${n(tm[1])} ${n(tm[2])} ${n(tm[3])} ${n(tm[4])} ${n(tm[5])} Tm` : `${n(opts.x ?? 0)} ${n(opts.y ?? 0)} Td`;
    const tz = opts.scaleX !== void 0 ? `${n(opts.scaleX * 100)} Tz ` : "";
    this.ops.push(`BT /${font} ${n(size)} Tf ${tz}${tmPart} <${hex}> Tj ET`);
  }
  clipRect(x, y, width, height) {
    this.assertWritable();
    this.ops.push(`${n(x)} ${n(y)} ${n(width)} ${n(height)} re W n`);
  }
  endClip() {
    this.assertWritable();
    this.ops.push("Q");
  }
  drawImage(name, opts) {
    this.assertWritable();
    this.usedImages.add(name);
    this.ops.push(`q ${opts.width} 0 0 ${opts.height} ${opts.x} ${opts.y} cm /${name} Do Q`);
  }
  setFillOpacity(alpha) {
    this.assertWritable();
    const a = Math.max(0, Math.min(1, Number(alpha)));
    const name = `GS${Math.round(a * 1e3)}`;
    this.fillAlpha = a;
    this.extG.set(name, a);
    this.usedExtG.add(name);
    this.ops.push(`/${name} gs`);
  }
  addLink(rect, uri) {
    this.assertWritable();
    this.annotDicts.push(makeLinkAnnot(rect, uri));
  }
  annotations() {
    if (this.writable) {
      return this.annotDicts.map((dict) => ({
        subtype: asName(dict.get("Subtype")) ?? null,
        rect: asBox(dict.get("Rect")) ?? null,
        dict
      }));
    }
    return readAnnotations(this.dict?.get("Annots"), this.resolve);
  }
  contentOperators() {
    if (!this.writable && this._contentOps) return this._contentOps;
    const bytes = this.contentBytes();
    const ops = bytes.length ? parseContent(bytes) : [];
    if (!this.writable) this._contentOps = ops;
    return ops;
  }
  extract() {
    return extractContent(this.contentOperators(), {
      pageHeight: this.height,
      resources: this.resolvedResources(),
      resolve: this.resolve
    });
  }
  layout() {
    return layoutPage({
      width: this.width,
      height: this.height,
      contentOperators: () => this.contentOperators(),
      resolvedResources: () => this.resolvedResources(),
      resolve: this.resolve,
      embeddedFonts: () => this.embeddedFonts()
    });
  }
  contentBytes() {
    if (this.writable && this.ops.length) {
      return encodeLatin1(this.ops.join("\n") + "\n");
    }
    if (!this.contents)
      return new Uint8Array();
    const resolved = this.resolve(this.contents);
    if (resolved instanceof PdfStream)
      return decodeStream(resolved);
    if (resolved instanceof PdfArray) {
      const parts = [];
      for (const item of resolved.items) {
        const s = this.resolve(item);
        if (s instanceof PdfStream)
          parts.push(decodeStream(s));
      }
      return concatBytes(parts);
    }
    return new Uint8Array();
  }
  resolvedResources() {
    if (this.resources)
      return this.resources;
    if (!this.dict)
      return null;
    return inheritDict(this.dict, "Resources", this.resolve);
  }
  assertWritable() {
    if (!this.writable)
      throw new Error("Cannot draw on a parsed page; recreate or mutate COS then save()");
  }
};
function paintRgb(color) {
  if (color == null || color === false) return null;
  const raw = String(color).trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === "transparent" || lower === "none") return null;
  const c = raw.startsWith("#") ? raw.slice(1) : raw;
  if (c.length === 6 && /^[0-9a-fA-F]{6}$/.test(c)) {
    const r = parseInt(c.slice(0, 2), 16) / 255;
    const g = parseInt(c.slice(2, 4), 16) / 255;
    const b = parseInt(c.slice(4, 6), 16) / 255;
    return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
  }
  return "0 0 0";
}
function n(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "0";
  return String(Math.round(x * 1e4) / 1e4);
}
function inheritBox(dict, key, resolve) {
  return inheritValue(dict, key, resolve, asBox);
}
function inheritDict(dict, key, resolve) {
  return inheritValue(dict, key, resolve, (obj) => asDict(obj) ?? null) ?? null;
}
function inheritValue(dict, key, resolve, pick) {
  let current = dict;
  const seen = /* @__PURE__ */ new Set();
  while (current) {
    if (current.has(key)) {
      const picked = pick(resolve(current.get(key)));
      if (picked !== void 0 && picked !== null)
        return picked;
    }
    const parent = current.get("Parent");
    if (!(parent instanceof PdfRef))
      break;
    const k = parent.key();
    if (seen.has(k))
      break;
    seen.add(k);
    const resolved = resolve(parent);
    current = asDict(resolved) ?? null;
  }
  return void 0;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/syntax/serialize.js
function escapeName(value) {
  let out = "/";
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    const ch = value[i];
    if (c < 33 || c > 126 || ch === "#" || ch === "(" || ch === ")" || ch === "<" || ch === ">" || ch === "[" || ch === "]" || ch === "{" || ch === "}" || ch === "/" || ch === "%") {
      out += `#${c.toString(16).toUpperCase().padStart(2, "0")}`;
    } else {
      out += ch;
    }
  }
  return out;
}
function escapeLiteralBytes(bytes) {
  let out = "(";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 92 || c === 40 || c === 41) {
      out += `\\${String.fromCharCode(c)}`;
    } else if (c === 10)
      out += "\\n";
    else if (c === 13)
      out += "\\r";
    else if (c === 9)
      out += "\\t";
    else if (c < 32 || c > 126)
      out += `\\${c.toString(8).padStart(3, "0")}`;
    else
      out += String.fromCharCode(c);
  }
  return out + ")";
}
function serializeObject(obj) {
  if (obj === null)
    return "null";
  if (obj === true)
    return "true";
  if (obj === false)
    return "false";
  if (typeof obj === "number") {
    if (!Number.isFinite(obj))
      throw new Error(`Cannot serialize number ${obj}`);
    if (Number.isInteger(obj))
      return String(obj);
    return String(obj);
  }
  if (obj instanceof PdfName)
    return escapeName(obj.value);
  if (obj instanceof PdfRef)
    return `${obj.num} ${obj.gen} R`;
  if (obj instanceof PdfString) {
    if (obj.hex) {
      let hex = "<";
      for (let i = 0; i < obj.bytes.length; i++)
        hex += obj.bytes[i].toString(16).toUpperCase().padStart(2, "0");
      return hex + ">";
    }
    return escapeLiteralBytes(obj.bytes);
  }
  if (obj instanceof PdfArray) {
    return `[ ${obj.items.map(serializeObject).join(" ")} ]`;
  }
  if (obj instanceof PdfDict)
    return serializeDict(obj);
  if (obj instanceof PdfStream) {
    throw new Error("Use serializeIndirect for stream objects");
  }
  throw new Error("Unknown COS object");
}
function serializeDict(dict) {
  const parts = ["<<"];
  for (const [k, v] of dict.entries) {
    parts.push(escapeName(k), serializeObject(v));
  }
  parts.push(">>");
  return parts.join(" ");
}
function serializeIndirect(num, gen, obj) {
  if (obj instanceof PdfStream) {
    const head = encodeLatin1(`${num} ${gen} obj
${serializeDict(obj.dict)}
stream
`);
    const tail = encodeLatin1("\nendstream\nendobj\n");
    const out = new Uint8Array(head.length + obj.data.length + tail.length);
    out.set(head, 0);
    out.set(obj.data, head.length);
    out.set(tail, head.length + obj.data.length);
    return out;
  }
  return encodeLatin1(`${num} ${gen} obj
${serializeObject(obj)}
endobj
`);
}
function formatXrefEntry(offset, gen, inUse) {
  const off = String(Math.max(0, offset)).padStart(10, "0");
  const g = String(gen).padStart(5, "0");
  const flag = inUse ? "n" : "f";
  return `${off} ${g} ${flag}\r
`;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/write/file.js
function writePdf(input) {
  const maxObj = Math.max(0, ...input.objects.keys());
  const header = encodeLatin1(`%PDF-${input.version}
%\xE2\xE3\xCF\xD3
`);
  const parts = [header];
  let pos = header.length;
  const offsets = /* @__PURE__ */ new Map();
  for (let n2 = 1; n2 <= maxObj; n2++) {
    const obj = input.objects.get(n2);
    if (!obj)
      continue;
    offsets.set(n2, pos);
    const chunk2 = serializeIndirect(n2, 0, obj);
    parts.push(chunk2);
    pos += chunk2.length;
  }
  if (input.xrefStyle === "stream") {
    return finishXrefStream(input, parts, pos, offsets, maxObj);
  }
  const xrefPos = pos;
  const size = maxObj + 1;
  let xref = `xref\r
0 ${size}\r
${formatXrefEntry(0, 65535, false)}`;
  for (let n2 = 1; n2 < size; n2++) {
    const off = offsets.get(n2);
    xref += off === void 0 ? formatXrefEntry(0, 0, false) : formatXrefEntry(off, 0, true);
  }
  const trailer = new PdfDict().set("Size", size).set("Root", new PdfRef(input.root, 0));
  if (input.info)
    trailer.set("Info", new PdfRef(input.info, 0));
  if (input.encrypt)
    trailer.set("Encrypt", input.encrypt);
  if (input.id)
    trailer.set("ID", new PdfArray([new PdfString(input.id, true), new PdfString(input.id, true)]));
  xref += `trailer\r
${serializeDict(trailer)}\r
startxref\r
${xrefPos}\r
%%EOF\r
`;
  parts.push(encodeLatin1(xref));
  return concatBytes(parts);
}
function finishXrefStream(input, parts, pos, offsets, maxObj) {
  const xrefNum = maxObj + 1;
  const size = xrefNum + 1;
  const row = 6;
  const raw = new Uint8Array(size * row);
  raw[5] = 255;
  for (let n2 = 1; n2 < size; n2++) {
    const o = n2 * row;
    const off = n2 === xrefNum ? pos : offsets.get(n2);
    if (off === void 0 && n2 !== xrefNum)
      continue;
    const v = off ?? pos;
    raw[o] = 1;
    raw[o + 1] = v >>> 24 & 255;
    raw[o + 2] = v >>> 16 & 255;
    raw[o + 3] = v >>> 8 & 255;
    raw[o + 4] = v & 255;
  }
  const compressed = flateEncode(raw);
  const dict = new PdfDict().set("Type", pdfName("XRef")).set("Size", size).set("W", new PdfArray([1, 4, 1])).set("Root", new PdfRef(input.root, 0)).set("Filter", pdfName("FlateDecode")).set("Length", compressed.length);
  if (input.info)
    dict.set("Info", new PdfRef(input.info, 0));
  if (input.encrypt)
    dict.set("Encrypt", input.encrypt);
  if (input.id)
    dict.set("ID", new PdfArray([new PdfString(input.id, true), new PdfString(input.id, true)]));
  parts.push(serializeIndirect(xrefNum, 0, new PdfStream(dict, compressed)));
  parts.push(encodeLatin1(`startxref\r
${pos}\r
%%EOF\r
`));
  return concatBytes(parts);
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/fonts/embed.js
function readU16(b, o) {
  return (b[o] ?? 0) << 8 | (b[o + 1] ?? 0);
}
function readI16(b, o) {
  const v = readU16(b, o);
  return v & 32768 ? v - 65536 : v;
}
function readU32(b, o) {
  return (b[o] ?? 0) * 16777216 + ((b[o + 1] ?? 0) << 16) + ((b[o + 2] ?? 0) << 8) + (b[o + 3] ?? 0);
}
function table(ttf, tag) {
  const n2 = readU16(ttf, 4);
  for (let i = 0; i < n2; i++) {
    const o = 12 + i * 16;
    const name = String.fromCharCode(ttf[o], ttf[o + 1], ttf[o + 2], ttf[o + 3]);
    if (name !== tag)
      continue;
    const off = readU32(ttf, o + 8);
    const len = readU32(ttf, o + 12);
    return ttf.subarray(off, off + len);
  }
  return null;
}
function ttfWinAnsiWidths(ttf) {
  const head = table(ttf, "head");
  const hhea = table(ttf, "hhea");
  const hmtx = table(ttf, "hmtx");
  const units = head ? readU16(head, 18) || 1e3 : 1e3;
  const scale = 1e3 / units;
  const bbox = head ? [readI16(head, 36), readI16(head, 38), readI16(head, 40), readI16(head, 42)].map((v) => Math.round(v * scale)) : [-100, -200, 1e3, 900];
  const ascent = hhea ? Math.round(readI16(hhea, 4) * scale) : 800;
  const descent = hhea ? Math.round(readI16(hhea, 6) * scale) : -200;
  const numH = hhea ? readU16(hhea, 34) : 1;
  const widths = new Array(256).fill(600);
  if (hmtx) {
    const advance = (gid) => {
      const idx = Math.min(gid, Math.max(0, numH - 1));
      return Math.round(readU16(hmtx, idx * 4) * scale);
    };
    for (let i = 32; i < 127; i++)
      widths[i] = advance(i);
  }
  return { widths, bbox, ascent, descent };
}
function makeTrueTypeFont(baseFont, ttf) {
  const metrics = ttfWinAnsiWidths(ttf);
  const compressed = flateEncode(ttf);
  const file = new PdfStream(new PdfDict().set("Length", compressed.length).set("Length1", ttf.length).set("Filter", pdfName("FlateDecode")), compressed);
  const descriptor = new PdfDict().set("Type", pdfName("FontDescriptor")).set("FontName", pdfName(baseFont)).set("Flags", 32).set("FontBBox", new PdfArray(metrics.bbox)).set("ItalicAngle", 0).set("Ascent", metrics.ascent).set("Descent", metrics.descent).set("CapHeight", Math.round(metrics.ascent * 0.8)).set("StemV", 80);
  const font = new PdfDict().set("Type", pdfName("Font")).set("Subtype", pdfName("TrueType")).set("BaseFont", pdfName(baseFont)).set("FirstChar", 32).set("LastChar", 255).set("Widths", new PdfArray(metrics.widths.slice(32))).set("Encoding", pdfName("WinAnsiEncoding"));
  return { font, descriptor, file, widths: metrics.widths };
}
function pdfStr(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return new PdfString(b, false);
}
function utf16BeHex(cp) {
  if (cp > 65535) {
    const s = cp - 65536;
    const hi = 55296 + (s >> 10);
    const lo = 56320 + (s & 1023);
    return hi.toString(16).padStart(4, "0") + lo.toString(16).padStart(4, "0");
  }
  return Number(cp).toString(16).padStart(4, "0");
}
function makeToUnicodeStream(cmap) {
  const pairs = [];
  if (cmap instanceof Map) {
    for (const [cid, cp] of cmap) pairs.push([Number(cid), Number(cp)]);
  } else if (cmap && typeof cmap === "object") {
    for (const [cid, cp] of Object.entries(cmap)) pairs.push([Number(cid), Number(cp)]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const lines = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange"
  ];
  for (let i = 0; i < pairs.length; i += 100) {
    const chunk2 = pairs.slice(i, i + 100);
    lines.push(`${chunk2.length} beginbfchar`);
    for (const [cid, cp] of chunk2) {
      if (!Number.isFinite(cid) || !Number.isFinite(cp)) continue;
      lines.push(`<${cid.toString(16).padStart(4, "0")}> <${utf16BeHex(cp)}>`);
    }
    lines.push("endbfchar");
  }
  lines.push("endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end");
  const compressed = flateEncode(encodeLatin1(lines.join("\n")));
  return new PdfStream(new PdfDict().set("Length", compressed.length).set("Filter", pdfName("FlateDecode")), compressed);
}
function makeCidTrueTypeFont(baseFont, ttf, widths = [], defaultWidth = 1e3, cmap) {
  const metrics = ttfWinAnsiWidths(ttf);
  const compressed = flateEncode(ttf);
  const file = new PdfStream(new PdfDict().set("Length", compressed.length).set("Length1", ttf.length).set("Filter", pdfName("FlateDecode")), compressed);
  const descriptor = new PdfDict().set("Type", pdfName("FontDescriptor")).set("FontName", pdfName(baseFont)).set("Flags", 4).set("FontBBox", new PdfArray(metrics.bbox)).set("ItalicAngle", 0).set("Ascent", metrics.ascent).set("Descent", metrics.descent).set("CapHeight", Math.round(metrics.ascent * 0.8)).set("StemV", 80);
  const wItems = [];
  const packed = [];
  let runStart = -1;
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    if (w == null || !Number.isFinite(w)) {
      if (runStart >= 0) {
        wItems.push(runStart, new PdfArray(packed.splice(0, packed.length)));
        runStart = -1;
      }
      continue;
    }
    if (runStart < 0) runStart = i;
    packed.push(Math.round(w));
  }
  if (runStart >= 0) wItems.push(runStart, new PdfArray(packed));
  const cidFont = new PdfDict().set("Type", pdfName("Font")).set("Subtype", pdfName("CIDFontType2")).set("BaseFont", pdfName(baseFont)).set("CIDSystemInfo", new PdfDict().set("Registry", pdfStr("Adobe")).set("Ordering", pdfStr("Identity")).set("Supplement", 0)).set("DW", Math.round(defaultWidth)).set("CIDToGIDMap", pdfName("Identity"));
  if (wItems.length) cidFont.set("W", new PdfArray(wItems));
  const font = new PdfDict().set("Type", pdfName("Font")).set("Subtype", pdfName("Type0")).set("BaseFont", pdfName(baseFont)).set("Encoding", pdfName("Identity-H"));
  const toUnicode = cmap ? makeToUnicodeStream(cmap) : null;
  return { font, cidFont, descriptor, file, widths, toUnicode };
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/security/aes.js
var SBOX = new Uint8Array([
  99,
  124,
  119,
  123,
  242,
  107,
  111,
  197,
  48,
  1,
  103,
  43,
  254,
  215,
  171,
  118,
  202,
  130,
  201,
  125,
  250,
  89,
  71,
  240,
  173,
  212,
  162,
  175,
  156,
  164,
  114,
  192,
  183,
  253,
  147,
  38,
  54,
  63,
  247,
  204,
  52,
  165,
  229,
  241,
  113,
  216,
  49,
  21,
  4,
  199,
  35,
  195,
  24,
  150,
  5,
  154,
  7,
  18,
  128,
  226,
  235,
  39,
  178,
  117,
  9,
  131,
  44,
  26,
  27,
  110,
  90,
  160,
  82,
  59,
  214,
  179,
  41,
  227,
  47,
  132,
  83,
  209,
  0,
  237,
  32,
  252,
  177,
  91,
  106,
  203,
  190,
  57,
  74,
  76,
  88,
  207,
  208,
  239,
  170,
  251,
  67,
  77,
  51,
  133,
  69,
  249,
  2,
  127,
  80,
  60,
  159,
  168,
  81,
  163,
  64,
  143,
  146,
  157,
  56,
  245,
  188,
  182,
  218,
  33,
  16,
  255,
  243,
  210,
  205,
  12,
  19,
  236,
  95,
  151,
  68,
  23,
  196,
  167,
  126,
  61,
  100,
  93,
  25,
  115,
  96,
  129,
  79,
  220,
  34,
  42,
  144,
  136,
  70,
  238,
  184,
  20,
  222,
  94,
  11,
  219,
  224,
  50,
  58,
  10,
  73,
  6,
  36,
  92,
  194,
  211,
  172,
  98,
  145,
  149,
  228,
  121,
  231,
  200,
  55,
  109,
  141,
  213,
  78,
  169,
  108,
  86,
  244,
  234,
  101,
  122,
  174,
  8,
  186,
  120,
  37,
  46,
  28,
  166,
  180,
  198,
  232,
  221,
  116,
  31,
  75,
  189,
  139,
  138,
  112,
  62,
  181,
  102,
  72,
  3,
  246,
  14,
  97,
  53,
  87,
  185,
  134,
  193,
  29,
  158,
  225,
  248,
  152,
  17,
  105,
  217,
  142,
  148,
  155,
  30,
  135,
  233,
  206,
  85,
  40,
  223,
  140,
  161,
  137,
  13,
  191,
  230,
  66,
  104,
  65,
  153,
  45,
  15,
  176,
  84,
  187,
  22
]);
var INV_SBOX = new Uint8Array(256);
for (let i = 0; i < 256; i++)
  INV_SBOX[SBOX[i]] = i;
var RCON = [0, 1, 2, 4, 8, 16, 32, 64, 128, 27, 54];
function xtime(a) {
  return (a << 1 ^ (a & 128 ? 27 : 0)) & 255;
}
function expandKey(key) {
  const w = new Uint8Array(176);
  w.set(key.subarray(0, 16));
  for (let i = 4; i < 44; i++) {
    let t0 = w[(i - 1) * 4];
    let t1 = w[(i - 1) * 4 + 1];
    let t2 = w[(i - 1) * 4 + 2];
    let t3 = w[(i - 1) * 4 + 3];
    if (i % 4 === 0) {
      const r = SBOX[t1] ^ RCON[i / 4];
      const a = SBOX[t2];
      const b = SBOX[t3];
      const c = SBOX[t0];
      t0 = r;
      t1 = a;
      t2 = b;
      t3 = c;
    }
    w[i * 4] = w[(i - 4) * 4] ^ t0;
    w[i * 4 + 1] = w[(i - 4) * 4 + 1] ^ t1;
    w[i * 4 + 2] = w[(i - 4) * 4 + 2] ^ t2;
    w[i * 4 + 3] = w[(i - 4) * 4 + 3] ^ t3;
  }
  return w;
}
function addRoundKey(s, rk, round) {
  const o = round * 16;
  for (let i = 0; i < 16; i++)
    s[i] = (s[i] ?? 0) ^ (rk[o + i] ?? 0);
}
function subBytes(s, box) {
  for (let i = 0; i < 16; i++)
    s[i] = box[s[i]];
}
function shiftRows(s) {
  let t = s[1];
  s[1] = s[5];
  s[5] = s[9];
  s[9] = s[13];
  s[13] = t;
  t = s[2];
  s[2] = s[10];
  s[10] = t;
  t = s[6];
  s[6] = s[14];
  s[14] = t;
  t = s[15];
  s[15] = s[11];
  s[11] = s[7];
  s[7] = s[3];
  s[3] = t;
}
function invShiftRows(s) {
  let t = s[13];
  s[13] = s[9];
  s[9] = s[5];
  s[5] = s[1];
  s[1] = t;
  t = s[2];
  s[2] = s[10];
  s[10] = t;
  t = s[6];
  s[6] = s[14];
  s[14] = t;
  t = s[3];
  s[3] = s[7];
  s[7] = s[11];
  s[11] = s[15];
  s[15] = t;
}
function mixColumn(c) {
  const a0 = c[0], a1 = c[1], a2 = c[2], a3 = c[3];
  c[0] = xtime(a0) ^ xtime(a1) ^ a1 ^ a2 ^ a3;
  c[1] = a0 ^ xtime(a1) ^ xtime(a2) ^ a2 ^ a3;
  c[2] = a0 ^ a1 ^ xtime(a2) ^ xtime(a3) ^ a3;
  c[3] = xtime(a0) ^ a0 ^ a1 ^ a2 ^ xtime(a3);
}
function invMixColumn(c) {
  const a0 = c[0], a1 = c[1], a2 = c[2], a3 = c[3];
  const x = (n2) => xtime(n2);
  const x2 = (n2) => x(x(n2));
  const x3 = (n2) => x(x2(n2));
  const mul = (n2, f) => {
    let r = 0;
    if (f & 1)
      r ^= n2;
    if (f & 2)
      r ^= x(n2);
    if (f & 4)
      r ^= x2(n2);
    if (f & 8)
      r ^= x3(n2);
    return r & 255;
  };
  c[0] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
  c[1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
  c[2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
  c[3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
}
function mixColumns(s, inv) {
  for (let i = 0; i < 4; i++) {
    const c = [s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3]];
    if (inv)
      invMixColumn(c);
    else
      mixColumn(c);
    s[i * 4] = c[0];
    s[i * 4 + 1] = c[1];
    s[i * 4 + 2] = c[2];
    s[i * 4 + 3] = c[3];
  }
}
function encryptBlock(input, rk) {
  const s = new Uint8Array(input);
  addRoundKey(s, rk, 0);
  for (let r = 1; r < 10; r++) {
    subBytes(s, SBOX);
    shiftRows(s);
    mixColumns(s, false);
    addRoundKey(s, rk, r);
  }
  subBytes(s, SBOX);
  shiftRows(s);
  addRoundKey(s, rk, 10);
  return s;
}
function decryptBlock(input, rk) {
  const s = new Uint8Array(input);
  addRoundKey(s, rk, 10);
  invShiftRows(s);
  subBytes(s, INV_SBOX);
  for (let r = 9; r >= 1; r--) {
    addRoundKey(s, rk, r);
    mixColumns(s, true);
    invShiftRows(s);
    subBytes(s, INV_SBOX);
  }
  addRoundKey(s, rk, 0);
  return s;
}
function pkcs7Pad(data) {
  const n2 = 16 - data.length % 16;
  const out = new Uint8Array(data.length + n2);
  out.set(data);
  out.fill(n2, data.length);
  return out;
}
function pkcs7Unpad(data) {
  const n2 = data[data.length - 1] ?? 0;
  if (n2 < 1 || n2 > 16)
    return data;
  return data.subarray(0, data.length - n2);
}
function aes128CbcEncrypt(key, iv, plain) {
  const rk = expandKey(key);
  const padded = pkcs7Pad(plain);
  const out = new Uint8Array(padded.length);
  let prev = new Uint8Array(iv);
  for (let i = 0; i < padded.length; i += 16) {
    const block = new Uint8Array(16);
    for (let j = 0; j < 16; j++)
      block[j] = padded[i + j] ^ prev[j];
    const enc = encryptBlock(block, rk);
    out.set(enc, i);
    prev = new Uint8Array(enc);
  }
  return out;
}
function aes128CbcDecrypt(key, iv, cipher) {
  const rk = expandKey(key);
  const out = new Uint8Array(cipher.length);
  let prev = new Uint8Array(iv);
  for (let i = 0; i < cipher.length; i += 16) {
    const block = cipher.subarray(i, i + 16);
    const dec = decryptBlock(block, rk);
    for (let j = 0; j < 16; j++)
      out[i + j] = dec[j] ^ prev[j];
    prev = new Uint8Array(block);
  }
  return pkcs7Unpad(out);
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/security/md5.js
function rotl(x, n2) {
  return (x << n2 | x >>> 32 - n2) >>> 0;
}
function add(a, b) {
  return a + b >>> 0;
}
function md5(bytes) {
  const orig = bytes.length;
  const bitLen = orig * 8;
  const paddedLen = (orig + 8 >> 6) + 1 << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[orig] = 128;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 4294967296), true);
  let a0 = 1732584193;
  let b0 = 4023233417;
  let c0 = 2562383102;
  let d0 = 271733878;
  const s = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++)
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  for (let off = 0; off < paddedLen; off += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++)
      M[i] = view.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) {
        F = B & C | ~B & D;
        g = i;
      } else if (i < 32) {
        F = D & B | ~D & C;
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = 7 * i % 16;
      }
      const tmp = D;
      D = C;
      C = B;
      B = add(B, rotl(add(add(A, F >>> 0), add(K[i], M[g])), s[(i >> 4) * 4 + i % 4]));
      A = tmp;
    }
    a0 = add(a0, A);
    b0 = add(b0, B);
    c0 = add(c0, C);
    d0 = add(d0, D);
  }
  const out = new Uint8Array(16);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, a0, true);
  dv.setUint32(4, b0, true);
  dv.setUint32(8, c0, true);
  dv.setUint32(12, d0, true);
  return out;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/security/rc4.js
function rc4(key, data) {
  const s = new Uint8Array(256);
  for (let i2 = 0; i2 < 256; i2++)
    s[i2] = i2;
  let j = 0;
  for (let i2 = 0; i2 < 256; i2++) {
    j = j + s[i2] + key[i2 % key.length] & 255;
    const t = s[i2];
    s[i2] = s[j];
    s[j] = t;
  }
  const out = new Uint8Array(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = i + 1 & 255;
    j = j + s[i] & 255;
    const t = s[i];
    s[i] = s[j];
    s[j] = t;
    out[k] = data[k] ^ s[s[i] + s[j] & 255];
  }
  return out;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/security/standard.js
var PAD = new Uint8Array([
  40,
  191,
  78,
  94,
  78,
  117,
  138,
  65,
  100,
  0,
  78,
  86,
  255,
  250,
  1,
  8,
  46,
  46,
  0,
  182,
  208,
  104,
  62,
  128,
  47,
  12,
  169,
  254,
  100,
  83,
  105,
  122
]);
var StandardSecurity = class {
  fileKey;
  mode;
  encryptMetadata;
  constructor(fileKey, mode, encryptMetadata = true) {
    this.fileKey = fileKey;
    this.mode = mode;
    this.encryptMetadata = encryptMetadata;
  }
  objectKey(num, gen) {
    const extra = this.mode === "aesv2" ? encodeLatin1("sAlT") : new Uint8Array(0);
    const buf = new Uint8Array(this.fileKey.length + 5 + extra.length);
    buf.set(this.fileKey);
    buf[this.fileKey.length] = num & 255;
    buf[this.fileKey.length + 1] = num >> 8 & 255;
    buf[this.fileKey.length + 2] = num >> 16 & 255;
    buf[this.fileKey.length + 3] = gen & 255;
    buf[this.fileKey.length + 4] = gen >> 8 & 255;
    buf.set(extra, this.fileKey.length + 5);
    const h = md5(buf);
    return h.subarray(0, Math.min(this.fileKey.length + 5, 16));
  }
  decryptBytes(data, num, gen) {
    if (this.mode === "identity" || data.length === 0)
      return data;
    const key = this.objectKey(num, gen);
    if (this.mode === "rc4")
      return rc4(key, data);
    if (data.length < 16)
      return data;
    return aes128CbcDecrypt(key, data.subarray(0, 16), data.subarray(16));
  }
  encryptBytes(data, num, gen) {
    if (this.mode === "identity")
      return data;
    const key = this.objectKey(num, gen);
    if (this.mode === "rc4")
      return rc4(key, data);
    const iv = randomBytes(16);
    const cipher = aes128CbcEncrypt(key, iv, data);
    const out = new Uint8Array(16 + cipher.length);
    out.set(iv);
    out.set(cipher, 16);
    return out;
  }
};
function pad32(password) {
  const out = new Uint8Array(32);
  const n2 = Math.min(password.length, 32);
  out.set(password.subarray(0, n2));
  if (n2 < 32)
    out.set(PAD.subarray(0, 32 - n2), n2);
  return out;
}
function pBytes(p) {
  const u = p >>> 0;
  return new Uint8Array([u & 255, u >>> 8 & 255, u >>> 16 & 255, u >>> 24 & 255]);
}
function computeFileKey(userPad, O, P, id0, keyLen, R, encryptMetadata) {
  const parts = [userPad, O, pBytes(P), id0];
  if (R >= 4 && !encryptMetadata)
    parts.push(new Uint8Array([255, 255, 255, 255]));
  let hash = md5(concatBytes(parts));
  if (R >= 3) {
    for (let i = 0; i < 50; i++)
      hash = md5(hash.subarray(0, keyLen));
  }
  return hash.subarray(0, keyLen);
}
function computeO(userPad, ownerPad, keyLen, R) {
  let hash = md5(ownerPad);
  if (R >= 3) {
    for (let i = 0; i < 50; i++)
      hash = md5(hash);
  }
  let key = hash.subarray(0, keyLen);
  let out = rc4(key, userPad);
  if (R >= 3) {
    for (let i = 1; i <= 19; i++) {
      const k = new Uint8Array(key.length);
      for (let j = 0; j < k.length; j++)
        k[j] = key[j] ^ i;
      out = rc4(k, out);
    }
  }
  return out;
}
function computeU(fileKey, id0, R) {
  if (R === 2)
    return rc4(fileKey, PAD);
  let hash = md5(concatBytes([PAD, id0]));
  let out = rc4(fileKey, hash);
  for (let i = 1; i <= 19; i++) {
    const k = new Uint8Array(fileKey.length);
    for (let j = 0; j < k.length; j++)
      k[j] = fileKey[j] ^ i;
    out = rc4(k, out);
  }
  const u = new Uint8Array(32);
  u.set(out.subarray(0, 16));
  u.set(randomBytes(16), 16);
  return u;
}
function asPdfBytes(obj) {
  if (obj instanceof PdfString)
    return obj.bytes;
  return void 0;
}
function openStandardSecurity(encrypt, id0, password) {
  const filter = asName(encrypt.get("Filter"));
  if (filter && filter !== "Standard")
    throw new PdfError(`Unsupported security handler: ${filter}`);
  const V = asNum(encrypt.get("V")) ?? 1;
  const R = asNum(encrypt.get("R")) ?? 2;
  const P = asNum(encrypt.get("P")) ?? -4;
  const length = asNum(encrypt.get("Length")) ?? (V === 1 ? 40 : 128);
  const keyLen = Math.floor(length / 8);
  const O = asPdfBytes(encrypt.get("O"));
  const U = asPdfBytes(encrypt.get("U"));
  if (!O || !U)
    throw new PdfError("Encrypt dict missing /O or /U");
  const encryptMetadata = encrypt.get("EncryptMetadata") !== false;
  let mode = "rc4";
  if (V === 4) {
    const stmF = asName(encrypt.get("StmF")) ?? "Identity";
    const cf = encrypt.get("CF");
    let cfm = "V2";
    if (cf instanceof PdfDict) {
      const std = cf.get(stmF);
      if (std instanceof PdfDict)
        cfm = asName(std.get("CFM")) ?? "V2";
    }
    if (cfm === "AESV2")
      mode = "aesv2";
    else if (cfm === "Identity")
      mode = "identity";
    else
      mode = "rc4";
  }
  if (V > 4)
    throw new PdfError("PDF encryption V>4 (AES-256) is not supported yet");
  const pw = encodeLatin1(password);
  const tryKey = (pad) => {
    const fileKey = computeFileKey(pad, O, P, id0, keyLen, R, encryptMetadata);
    const u = computeU(fileKey, id0, R);
    const n2 = R === 2 ? 32 : 16;
    for (let i = 0; i < n2; i++) {
      if (u[i] !== U[i])
        return null;
    }
    return new StandardSecurity(fileKey, mode, encryptMetadata);
  };
  const user = tryKey(pad32(pw));
  if (user)
    return user;
  let hash = md5(pad32(pw));
  if (R >= 3) {
    for (let i = 0; i < 50; i++)
      hash = md5(hash);
  }
  let key = new Uint8Array(hash.subarray(0, keyLen));
  let userPad = new Uint8Array(O);
  if (R === 2)
    userPad = new Uint8Array(rc4(key, O));
  else {
    for (let i = 19; i >= 0; i--) {
      const k = new Uint8Array(key.length);
      for (let j = 0; j < k.length; j++)
        k[j] = (key[j] ?? 0) ^ i;
      userPad = new Uint8Array(rc4(k, userPad));
    }
  }
  const owner = tryKey(userPad);
  if (owner)
    return owner;
  throw new PdfError("Invalid password");
}
function makeStandardEncryptDict(userPassword, ownerPassword, id0, P = -4) {
  const keyLen = 16;
  const R = 4;
  const userPad = pad32(encodeLatin1(userPassword));
  const ownerPad = pad32(encodeLatin1(ownerPassword ?? userPassword));
  const O = computeO(userPad, ownerPad, keyLen, R);
  const fileKey = computeFileKey(userPad, O, P, id0, keyLen, R, true);
  const U = computeU(fileKey, id0, R);
  const stdcf = new PdfDict().set("AuthEvent", pdfName("DocOpen")).set("CFM", pdfName("AESV2")).set("Length", 16);
  const cf = new PdfDict().set("StdCF", stdcf);
  const dict = new PdfDict().set("Filter", pdfName("Standard")).set("V", 4).set("R", 4).set("Length", 128).set("P", P).set("O", new PdfString(O, false)).set("U", new PdfString(U, false)).set("StmF", pdfName("StdCF")).set("StrF", pdfName("StdCF")).set("CF", cf);
  return { dict, security: new StandardSecurity(fileKey, "aesv2", true) };
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/write/save.js
function cryptObject(obj, fn) {
  const seen = /* @__PURE__ */ new Set();
  const walk = (o) => {
    if (o === null || typeof o !== "object")
      return;
    if (o instanceof PdfRef)
      return;
    if (seen.has(o))
      return;
    seen.add(o);
    if (o instanceof PdfString || o instanceof PdfStream)
      fn(o);
    if (o instanceof PdfStream)
      walk(o.dict);
    else if (o instanceof PdfDict) {
      for (const v of o.entries.values())
        walk(v);
    } else if (o instanceof PdfArray) {
      for (const v of o.items)
        walk(v);
    }
  };
  walk(obj);
}
function saveCreated(input) {
  const pages = input.pages;
  if (!pages.length)
    throw new Error("Cannot save a document with no pages");
  const objects = /* @__PURE__ */ new Map();
  let next = 1;
  const alloc = (obj) => {
    const n2 = next++;
    objects.set(n2, obj);
    return new PdfRef(n2, 0);
  };
  const catalog = new PdfDict().set("Type", pdfName("Catalog"));
  const catalogRef = alloc(catalog);
  const pagesDict = new PdfDict().set("Type", pdfName("Pages"));
  const pagesRef = alloc(pagesDict);
  catalog.set("Pages", pagesRef);
  const fontRefs = /* @__PURE__ */ new Map();
  const fontMap = input.fonts ?? /* @__PURE__ */ new Map();
  const allFontKeys = /* @__PURE__ */ new Set(["F1"]);
  for (const page of pages)
    for (const k of page.usedFonts)
      allFontKeys.add(k);
  for (const key of allFontKeys) {
    const spec = fontMap.get(key);
    if (spec?.ttf) {
      const built = spec.cid ? makeCidTrueTypeFont(spec.baseFont, spec.ttf, spec.widths || [], spec.defaultWidth ?? 1e3, spec.cmap) : makeTrueTypeFont(spec.baseFont, spec.ttf);
      const fileRef = alloc(built.file);
      built.descriptor.set("FontFile2", fileRef);
      const descRef = alloc(built.descriptor);
      if (spec.cid) {
        built.cidFont.set("FontDescriptor", descRef);
        const cidRef = alloc(built.cidFont);
        built.font.set("DescendantFonts", new PdfArray([cidRef]));
        if (built.toUnicode) built.font.set("ToUnicode", alloc(built.toUnicode));
        fontRefs.set(key, alloc(built.font));
      } else {
        built.font.set("FontDescriptor", descRef);
        fontRefs.set(key, alloc(built.font));
      }
    } else {
      fontRefs.set(key, alloc(new PdfDict().set("Type", pdfName("Font")).set("Subtype", pdfName("Type1")).set("BaseFont", pdfName(spec?.baseFont ?? "Helvetica"))));
    }
  }
  const imageRefs = /* @__PURE__ */ new Map();
  for (const [key, img] of input.images ?? []) {
    imageRefs.set(key, alloc(img.stream));
  }
  const gsByName = /* @__PURE__ */ new Map();
  for (const page of pages) {
    for (const [gsName, ca] of page.extG || []) {
      if (gsByName.has(gsName)) continue;
      gsByName.set(gsName, alloc(new PdfDict().set("Type", pdfName("ExtGState")).set("ca", ca).set("CA", 1)));
    }
  }
  if (!gsByName.size) {
    gsByName.set("GS1", alloc(new PdfDict().set("Type", pdfName("ExtGState")).set("ca", pages.find((p) => p.fillAlpha !== null)?.fillAlpha ?? 1).set("CA", 1)));
  }
  const kidRefs = [];
  for (const page of pages) {
    const ops = page.ops.length ? `${page.ops.join("\n")}
` : "";
    const compressed = flateEncode(encodeLatin1(ops));
    const contentRef = alloc(new PdfStream(new PdfDict().set("Length", compressed.length).set("Filter", pdfName("FlateDecode")), compressed));
    const fontRes = new PdfDict();
    for (const k of page.usedFonts) {
      const r = fontRefs.get(k);
      if (r)
        fontRes.set(k, r);
    }
    const xobj = new PdfDict();
    for (const k of page.usedImages) {
      const r = imageRefs.get(k);
      if (r)
        xobj.set(k, r);
    }
    const resources = new PdfDict().set("Font", fontRes);
    if (xobj.entries.size)
      resources.set("XObject", xobj);
    if (page.usedExtG.size) {
      const gs = new PdfDict();
      for (const k of page.usedExtG)
        gs.set(k, gsByName.get(k) || gsByName.values().next().value);
      resources.set("ExtGState", gs);
    }
    const pageDict = new PdfDict().set("Type", pdfName("Page")).set("Parent", pagesRef).set("MediaBox", new PdfArray([...page.mediaBox])).set("Contents", contentRef).set("Resources", resources);
    if (page.annotDicts.length) {
      pageDict.set("Annots", new PdfArray(page.annotDicts));
    }
    kidRefs.push(alloc(pageDict));
  }
  pagesDict.set("Kids", new PdfArray(kidRefs));
  pagesDict.set("Count", kidRefs.length);
  let encryptRef;
  let security;
  const id = randomBytes(16);
  if (input.userPassword) {
    const made = makeStandardEncryptDict(input.userPassword, input.ownerPassword, id);
    encryptRef = alloc(made.dict);
    security = made.security;
    const encNum = encryptRef.num;
    for (const [num, obj] of objects) {
      if (num === encNum)
        continue;
      cryptObject(obj, (target) => {
        if (target instanceof PdfString)
          target.bytes = security.encryptBytes(target.bytes, num, 0);
        else {
          target.data = security.encryptBytes(target.data, num, 0);
          target.dict.set("Length", target.data.length);
        }
      });
    }
  }
  return writePdf({
    version: input.version,
    objects,
    root: catalogRef.num,
    id: input.userPassword ? id : void 0,
    encrypt: encryptRef,
    xrefStyle: input.xrefStyle
  });
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/images/embed.js
function jpegDimensions(bytes) {
  let i = 0;
  if (bytes[0] !== 255 || bytes[1] !== 216)
    throw new PdfError("Not a JPEG");
  i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 255) {
      i++;
      continue;
    }
    while (bytes[i] === 255)
      i++;
    const marker = bytes[i++];
    if (marker === 217 || marker === 218)
      break;
    const len = (bytes[i] ?? 0) << 8 | (bytes[i + 1] ?? 0);
    if (marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204) {
      return {
        height: (bytes[i + 3] ?? 0) << 8 | (bytes[i + 4] ?? 0),
        width: (bytes[i + 5] ?? 0) << 8 | (bytes[i + 6] ?? 0),
        components: bytes[i + 7] ?? 3
      };
    }
    i += len;
  }
  throw new PdfError("JPEG missing SOF");
}
function embedJpeg(bytes) {
  const dim = jpegDimensions(bytes);
  const cs = dim.components === 1 ? "DeviceGray" : "DeviceRGB";
  const stream = new PdfStream(new PdfDict().set("Type", pdfName("XObject")).set("Subtype", pdfName("Image")).set("Width", dim.width).set("Height", dim.height).set("ColorSpace", pdfName(cs)).set("BitsPerComponent", 8).set("Filter", pdfName("DCTDecode")).set("Length", bytes.length), bytes);
  return { width: dim.width, height: dim.height, stream };
}
function embedPng(bytes) {
  if (bytes[0] !== 137 || bytes[1] !== 80)
    throw new PdfError("Not a PNG");
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 2;
  const idat = [];
  while (pos + 8 <= bytes.length) {
    const len = (bytes[pos] << 24 | bytes[pos + 1] << 16 | bytes[pos + 2] << 8 | bytes[pos + 3]) >>> 0;
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data[0] << 24 | data[1] << 16 | data[2] << 8 | data[3];
      height = data[4] << 24 | data[5] << 16 | data[6] << 8 | data[7];
      bitDepth = data[8] ?? 8;
      colorType = data[9] ?? 2;
    } else if (type === "IDAT")
      idat.push(data);
    else if (type === "IEND")
      break;
    pos += 12 + len;
  }
  const compressed = concat(idat);
  const raw = flateDecode(compressed);
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (bitDepth !== 8 || colorType !== 0 && colorType !== 2 && colorType !== 6) {
    throw new PdfError("PNG embed supports 8-bit gray/RGB/RGBA only");
  }
  const rgb = unfilterPng(raw, width, height, channels, colorType);
  const flate = flateEncode(rgb);
  const cs = colorType === 0 ? "DeviceGray" : "DeviceRGB";
  const stream = new PdfStream(new PdfDict().set("Type", pdfName("XObject")).set("Subtype", pdfName("Image")).set("Width", width).set("Height", height).set("ColorSpace", pdfName(cs)).set("BitsPerComponent", 8).set("Filter", pdfName("FlateDecode")).set("Length", flate.length), flate);
  return { width, height, stream };
}
function unfilterPng(raw, width, height, bpp, colorType) {
  const stride = width * bpp + 1;
  if (raw.length < stride * height)
    throw new PdfError("PNG IDAT truncated");
  const rgbCh = colorType === 0 ? 1 : 3;
  const rgb = new Uint8Array(width * height * rgbCh);
  const prev = new Uint8Array(width * bpp);
  const curr = new Uint8Array(width * bpp);
  let di = 0;
  for (let y = 0; y < height; y++) {
    const rowOff = y * stride;
    const filter = raw[rowOff] ?? 0;
    const src = rowOff + 1;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < bpp; c++) {
        const a = x > 0 ? curr[(x - 1) * bpp + c] : 0;
        const b = prev[x * bpp + c];
        const cp = x > 0 ? prev[(x - 1) * bpp + c] : 0;
        let v = raw[src + x * bpp + c] ?? 0;
        if (filter === 1)
          v = v + a & 255;
        else if (filter === 2)
          v = v + b & 255;
        else if (filter === 3)
          v = v + (a + b >> 1) & 255;
        else if (filter === 4)
          v = v + paethPredictor(a, b, cp) & 255;
        curr[x * bpp + c] = v;
      }
      if (colorType === 0) {
        rgb[di++] = curr[x];
      } else if (colorType === 6) {
        const alpha = curr[x * 4 + 3] / 255;
        rgb[di++] = Math.round(curr[x * 4] * alpha + 255 * (1 - alpha));
        rgb[di++] = Math.round(curr[x * 4 + 1] * alpha + 255 * (1 - alpha));
        rgb[di++] = Math.round(curr[x * 4 + 2] * alpha + 255 * (1 - alpha));
      } else {
        rgb[di++] = curr[x * 3];
        rgb[di++] = curr[x * 3 + 1];
        rgb[di++] = curr[x * 3 + 2];
      }
    }
    prev.set(curr);
  }
  return rgb;
}
function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function concat(parts) {
  let n2 = 0;
  for (const p of parts)
    n2 += p.length;
  const out = new Uint8Array(n2);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/forms/acroform.js
function fieldName(dict, resolve) {
  const t = dict.get("T");
  const resolved = t ? resolve(t) : void 0;
  if (resolved instanceof PdfString)
    return resolved.asLatin1();
  return "";
}
function fieldValue(dict, resolve) {
  const v = dict.get("V");
  if (v === void 0)
    return null;
  const resolved = resolve(v);
  if (resolved instanceof PdfString)
    return resolved.asLatin1();
  if (typeof resolved === "object" && resolved && "value" in resolved)
    return String(resolved.value);
  return null;
}
function walkFields(fields, resolve, prefix = "") {
  const arr = asArray(fields ? resolve(fields) : void 0);
  if (!arr)
    return [];
  const out = [];
  for (const item of arr.items) {
    const dict = asDict(resolve(item));
    if (!dict)
      continue;
    const name = [prefix, fieldName(dict, resolve)].filter(Boolean).join(".");
    const kids = dict.get("Kids");
    if (kids)
      out.push(...walkFields(kids, resolve, name));
    else {
      out.push({
        name,
        type: asName(dict.get("FT")) ?? null,
        value: fieldValue(dict, resolve),
        dict
      });
    }
  }
  return out;
}
function setFieldValue(field, value) {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++)
    bytes[i] = value.charCodeAt(i) & 255;
  field.dict.set("V", new PdfString(bytes, false));
  field.value = value;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/ocg/ocg.js
function readOcProperties(catalog, resolve) {
  const raw = catalog.get("OCProperties");
  if (!raw)
    return null;
  return asDict(resolve(raw)) ?? null;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/cos/document.js
var PdfDocument = class _PdfDocument {
  headerVersion = "1.6";
  catalogVersion = null;
  trailer = null;
  mode = "create";
  source = null;
  xref = /* @__PURE__ */ new Map();
  cache = /* @__PURE__ */ new Map();
  objStmCache = /* @__PURE__ */ new Map();
  createdPages = [];
  catalogDict = null;
  pageCache = null;
  security = null;
  encryptObjNum = null;
  fonts = /* @__PURE__ */ new Map();
  images = /* @__PURE__ */ new Map();
  fontSeq = 1;
  imageSeq = 1;
  static create(opts = {}) {
    const doc = new _PdfDocument();
    doc.mode = "create";
    doc.headerVersion = opts.version ?? "1.6";
    doc.fonts.set("F1", { baseFont: "Helvetica" });
    return doc;
  }
  static open(input, opts = {}) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length < 8)
      throw new PdfError("File too small to be a PDF");
    const header = parseHeader(bytes);
    let xref;
    try {
      xref = loadXref(bytes);
    } catch {
      xref = repairXref(bytes);
    }
    const root = asRef(xref.trailer.get("Root"));
    if (!root)
      throw new PdfError("Trailer missing /Root");
    const doc = new _PdfDocument();
    doc.mode = "open";
    doc.source = bytes;
    doc.headerVersion = header.version;
    doc.xref = xref.entries;
    doc.trailer = xref.trailer;
    const encRef = asRef(xref.trailer.get("Encrypt"));
    if (encRef) {
      doc.encryptObjNum = encRef.num;
      const enc = asDict(doc.getObject(encRef));
      if (!enc)
        throw new PdfError("Encrypt is not a dictionary");
      const idArr = asArray(xref.trailer.get("ID"));
      const id0 = idArr && idArr.items[0] instanceof PdfString ? idArr.items[0].bytes : new Uint8Array(16);
      doc.security = openStandardSecurity(enc, id0, opts.password ?? "");
    }
    const catalog = doc.resolve(root);
    const catalogDict = asDict(catalog);
    if (!catalogDict)
      throw new PdfError("Catalog is not a dictionary");
    doc.catalogDict = catalogDict;
    const ver = asName(catalogDict.get("Version"));
    if (ver)
      doc.catalogVersion = ver;
    return doc;
  }
  addPage(opts = {}) {
    if (this.mode !== "create")
      throw new PdfError("Cannot addPage() on a parsed document");
    const width = opts.width ?? 612;
    const height = opts.height ?? 792;
    const page = new PdfPage([0, 0, width, height], null, null, null, null, void 0, (obj) => this.resolve(obj), true);
    this.createdPages.push(page);
    return page;
  }
  embedFont(ttf, baseFont = "Embedded", opts = {}) {
    let key = opts.key;
    if (!key) {
      this.fontSeq++;
      key = `F${this.fontSeq}`;
    }
    this.fonts.set(key, {
      baseFont,
      ttf,
      cid: Boolean(opts.cid),
      widths: opts.widths,
      defaultWidth: opts.defaultWidth ?? 1e3,
      cmap: opts.cmap
    });
    return key;
  }
  embedJpeg(bytes) {
    const img = embedJpeg(bytes);
    const name = `Im${this.imageSeq++}`;
    this.images.set(name, img);
    return { name, width: img.width, height: img.height };
  }
  embedPng(bytes) {
    const img = embedPng(bytes);
    const name = `Im${this.imageSeq++}`;
    this.images.set(name, img);
    return { name, width: img.width, height: img.height };
  }
  getPages() {
    if (this.mode === "create")
      return this.createdPages;
    if (this.pageCache)
      return this.pageCache;
    if (!this.catalogDict)
      throw new PdfError("Missing catalog");
    const pagesRef = this.catalogDict.get("Pages");
    if (!pagesRef)
      throw new PdfError("Catalog missing /Pages");
    const pagesObj = asDict(this.resolve(pagesRef));
    if (!pagesObj)
      throw new PdfError("/Pages is not a dictionary");
    const collected = [];
    this.walkPages(pagesObj, asRef(pagesRef) ?? null, collected, /* @__PURE__ */ new Set());
    this.pageCache = collected;
    return collected;
  }
  acroForm() {
    if (!this.catalogDict)
      return [];
    const raw = this.catalogDict.get("AcroForm");
    if (!raw)
      return [];
    const form = asDict(this.resolve(raw));
    if (!form)
      return [];
    return walkFields(form.get("Fields"), (o) => this.resolve(o));
  }
  setField(name, value) {
    const field = this.acroForm().find((f) => f.name === name);
    if (!field)
      throw new PdfError(`No field named ${name}`);
    setFieldValue(field, value);
  }
  optionalContent() {
    if (!this.catalogDict)
      return null;
    return readOcProperties(this.catalogDict, (o) => this.resolve(o));
  }
  getObject(ref) {
    const key = ref.key();
    const cached = this.cache.get(key);
    if (cached !== void 0)
      return cached;
    if (!this.source)
      throw new PdfError("No source bytes");
    const entry = this.xref.get(ref.num);
    if (!entry || !entry.inUse)
      throw new PdfError(`Object ${ref.num} ${ref.gen} is missing or free`);
    if (entry.compressed) {
      const values = this.loadObjStm(entry.compressed.streamObjNum);
      const value = values[entry.compressed.index];
      if (value === void 0)
        throw new PdfError(`ObjStm missing index ${entry.compressed.index}`);
      this.cache.set(key, value);
      return value;
    }
    const tok = new Tokenizer(this.source, entry.offset);
    const parsed = parseIndirectObject(tok, (r) => this.getObject(r));
    if (this.security && ref.num !== this.encryptObjNum) {
      cryptObject(parsed.value, (target) => {
        if (target instanceof PdfString)
          target.bytes = this.security.decryptBytes(target.bytes, ref.num, ref.gen);
        else if (asName(target.dict.get("Type")) !== "XRef") {
          target.data = this.security.decryptBytes(target.data, ref.num, ref.gen);
        }
      });
    }
    this.cache.set(key, parsed.value);
    return parsed.value;
  }
  resolve(obj) {
    const seen = /* @__PURE__ */ new Set();
    let current = obj;
    while (current instanceof PdfRef) {
      const k = current.key();
      if (seen.has(k))
        throw new PdfError(`Cyclic reference ${k}`);
      seen.add(k);
      current = this.getObject(current);
    }
    return current;
  }
  save(opts = {}) {
    if (this.mode === "create") {
      return saveCreated({
        version: this.headerVersion,
        pages: this.createdPages,
        fonts: this.fonts,
        images: this.images,
        userPassword: opts.userPassword,
        ownerPassword: opts.ownerPassword,
        xrefStyle: opts.xrefStyle
      });
    }
    return this.saveParsed(opts);
  }
  saveParsed(opts) {
    const objects = /* @__PURE__ */ new Map();
    for (const [num, ent] of this.xref) {
      if (!ent.inUse || num === 0)
        continue;
      try {
        const obj = this.getObject(new PdfRef(num, ent.gen));
        const type = asName(asDict(obj)?.get("Type"));
        if (type === "XRef" || type === "ObjStm" || type === "Linearized")
          continue;
        objects.set(num, obj);
      } catch {
      }
    }
    const root = asRef(this.trailer?.get("Root"));
    if (!root)
      throw new PdfError("Cannot save: missing Root");
    return writePdf({
      version: this.headerVersion,
      objects,
      root: root.num,
      xrefStyle: opts.xrefStyle ?? "table"
    });
  }
  loadObjStm(streamNum) {
    const cached = this.objStmCache.get(streamNum);
    if (cached)
      return cached;
    const stm = this.getObject(new PdfRef(streamNum, 0));
    if (!(stm instanceof PdfStream))
      throw new PdfError("ObjStm is not a stream");
    const parsed = parseObjectStream(stm);
    const values = parsed.map((p) => p.value);
    this.objStmCache.set(streamNum, values);
    for (const p of parsed)
      this.cache.set(`${p.num} 0`, p.value);
    return values;
  }
  walkPages(node, ref, out, seen) {
    const type = asName(node.get("Type"));
    if (type === "Pages" || !type && node.has("Kids")) {
      const kidsRaw = node.get("Kids");
      if (kidsRaw === void 0)
        throw new PdfError("Pages node missing /Kids");
      const kids = asArray(this.resolve(kidsRaw));
      if (!kids)
        throw new PdfError("Pages node missing /Kids");
      for (const kid of kids.items) {
        const kidRef = asRef(kid);
        const key = kidRef ? kidRef.key() : "";
        if (key && seen.has(key))
          continue;
        if (key)
          seen.add(key);
        const dict = asDict(this.resolve(kid));
        if (!dict)
          continue;
        this.walkPages(dict, kidRef ?? null, out, seen);
      }
      return;
    }
    const mediaBox = inheritBox(node, "MediaBox", (o) => this.resolve(o));
    if (!mediaBox)
      throw new PdfError("Page missing /MediaBox");
    const cropBox = inheritBox(node, "CropBox", (o) => this.resolve(o)) ?? null;
    const resources = inheritDict(node, "Resources", (o) => this.resolve(o));
    out.push(new PdfPage(mediaBox, cropBox, resources, node, ref, node.get("Contents"), (o) => this.resolve(o), false));
  }
};

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/layout/html.js
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function px(n2) {
  const v = Number(n2);
  if (!Number.isFinite(v)) return "0";
  return String(Math.round(v * 1e3) / 1e3);
}
function topFromBottom(pageHeightPt, minY, h) {
  return pageHeightPt - Number(minY || 0) - Number(h || 0);
}
function fontFaceCss(fonts) {
  if (!fonts || !fonts.length) return "";
  const rules = [];
  for (const f of fonts) {
    if (!f.dataBase64 || !f.id) continue;
    const fmt = f.format === "otf" || f.format === "cff" ? "opentype" : "truetype";
    rules.push(`@font-face{font-family:'${esc(f.id)}';src:url(data:font/${fmt};base64,${f.dataBase64}) format('${fmt}');}`);
  }
  return rules.length ? `<style>${rules.join("")}</style>` : "";
}
function setBox(el, left, top, w, h) {
  el.style.position = "absolute";
  el.style.left = px(left) + "px";
  el.style.top = px(top) + "px";
  el.style.width = px(w) + "px";
  el.style.height = px(h) + "px";
}
function paintLayout(host, layout, opts = {}) {
  const doc = host.ownerDocument;
  const scale = Number(opts.scale) > 0 ? Number(opts.scale) : 1;
  const pageW = Number(layout.pageWidthPt) || 0;
  const pageH = Number(layout.pageHeightPt) || 0;
  const page = doc.createElement("div");
  page.className = "niqer-pdf-page";
  page.style.position = "relative";
  page.style.width = px(pageW * scale) + "px";
  page.style.height = px(pageH * scale) + "px";
  page.style.overflow = "hidden";
  page.style.background = "#fff";
  const css = fontFaceCss(layout.embeddedFonts);
  if (css) page.insertAdjacentHTML("afterbegin", css);
  for (const p of layout.paths || []) {
    const bar = doc.createElement("i");
    setBox(bar, Number(p.minX) * scale, topFromBottom(pageH, p.minY, p.h) * scale, p.w * scale, p.h * scale);
    bar.style.display = "block";
    bar.style.background = p.fill || "#000";
    page.appendChild(bar);
  }
  for (const im of layout.images || []) {
    const left = Number(im.minX) * scale;
    const top = topFromBottom(pageH, im.minY, im.h) * scale;
    if (im.dataUrl) {
      const img = doc.createElement("img");
      img.alt = "";
      img.src = im.dataUrl;
      setBox(img, left, top, im.w * scale, im.h * scale);
      page.appendChild(img);
    } else {
      const ph = doc.createElement("i");
      setBox(ph, left, top, im.w * scale, im.h * scale);
      ph.style.display = "block";
      ph.style.background = "#eee";
      page.appendChild(ph);
    }
  }
  for (const t of layout.textLines || []) {
    const span = doc.createElement("span");
    const yTop = t.yTopPt != null ? Number(t.yTopPt) : topFromBottom(pageH, t.baselineFromBottom, t.ascentPt || t.fontSize);
    setBox(span, Number(t.xPt) * scale, yTop * scale, (t.wPt || t.fontSize) * scale, (t.hPt || t.fontSize) * scale);
    span.style.fontSize = px(Number(t.fontSize) * scale) + "px";
    span.style.lineHeight = "1";
    span.style.color = t.color || "#000";
    span.style.whiteSpace = "pre";
    span.style.overflow = "visible";
    const family = t.fontFace || t.fontName;
    if (family) span.style.fontFamily = family + ",sans-serif";
    const sx = Number(t.scaleX);
    if (Number.isFinite(sx) && sx > 0 && Math.abs(sx - 1) > 0.01) {
      span.style.transform = "scaleX(" + px(sx) + ")";
      span.style.transformOrigin = "left top";
    }
    span.textContent = t.content == null ? "" : String(t.content);
    page.appendChild(span);
  }
  return page;
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/layout/element.js
var TAG = "niqer-pdf";
var ATTRS = ["src", "page", "scale", "password"];
function fire(el, name, detail) {
  el.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
}
function numOf(raw, def) {
  if (raw == null || raw === "") return def;
  const n2 = Number(raw);
  return Number.isFinite(n2) ? n2 : def;
}
function rootOf(el) {
  return el.shadowRoot || el;
}
function shownIndexes(doc, pageAttr) {
  const pages = doc.getPages();
  const page = numOf(pageAttr, 0);
  if (page >= 1) {
    const i = Math.floor(page) - 1;
    if (i >= 0 && i < pages.length) return [i];
  }
  return pages.map((_, i) => i);
}
function paintDoc(host, doc, opts) {
  const scale = Number(opts.scale) > 0 ? Number(opts.scale) : 1;
  const pages = doc.getPages();
  const indexes = shownIndexes(doc, opts.page);
  const root = rootOf(host);
  host.classList.add("niqer-pdf");
  const style = host.ownerDocument.createElement("style");
  style.textContent = ":host{display:flex;flex-direction:column;gap:8px;align-items:flex-start}";
  root.replaceChildren(style);
  for (const i of indexes) {
    root.appendChild(paintLayout(host, pages[i].layout(), { scale }));
  }
  return pages.length;
}
var HtmlBase = typeof HTMLElement === "function" ? HTMLElement : class {
};
var NiqerPdf = class extends HtmlBase {
  static get observedAttributes() {
    return ATTRS.slice();
  }
  constructor() {
    super();
    if (this.attachShadow && !this.shadowRoot) this.attachShadow({ mode: "open" });
    this._bytes = null;
    this._doc = null;
    this._gen = 0;
  }
  get src() {
    return this.getAttribute("src");
  }
  set src(v) {
    v == null || v === "" ? this.removeAttribute("src") : this.setAttribute("src", String(v));
  }
  get page() {
    return numOf(this.getAttribute("page"), 0);
  }
  set page(v) {
    v == null || v === "" ? this.removeAttribute("page") : this.setAttribute("page", String(v));
  }
  get scale() {
    return numOf(this.getAttribute("scale"), 1);
  }
  set scale(v) {
    Number(v) > 0 ? this.setAttribute("scale", String(v)) : this.removeAttribute("scale");
  }
  get password() {
    return this.getAttribute("password") || "";
  }
  set password(v) {
    v ? this.setAttribute("password", String(v)) : this.removeAttribute("password");
  }
  get bytes() {
    return this._bytes;
  }
  set bytes(value) {
    this._bytes = value ? new Uint8Array(value) : null;
    this._doc = null;
    this.reload();
  }
  get pdf() {
    return this._doc;
  }
  get pageCount() {
    return this._doc ? this._doc.getPages().length : 0;
  }
  connectedCallback() {
    this.reload();
  }
  disconnectedCallback() {
    this._gen++;
  }
  attributeChangedCallback(name) {
    if (!this.isConnected) return;
    if (name === "src" || name === "password") {
      this._doc = null;
      this.reload();
      return;
    }
    if (this._doc) this.paint();
  }
  async reload() {
    const gen = ++this._gen;
    try {
      let bytes = this._bytes;
      const src = this.src;
      if (!bytes && src) {
        const res = await fetch(src);
        if (!res.ok) throw new Error("pdf fetch " + res.status);
        bytes = new Uint8Array(await res.arrayBuffer());
        if (gen !== this._gen) return;
        this._bytes = bytes;
      }
      if (!bytes) {
        rootOf(this).replaceChildren();
        return;
      }
      this._doc = PdfDocument.open(bytes, { password: this.password });
      if (gen !== this._gen) return;
      const pages = this.paint();
      fire(this, "load", { pages, pdf: this._doc });
    } catch (err) {
      if (gen !== this._gen) return;
      rootOf(this).replaceChildren();
      fire(this, "error", err);
    }
  }
  paint() {
    if (!this._doc) return 0;
    return paintDoc(this, this._doc, { scale: this.scale, page: this.page });
  }
  /** 当前显示页的抽出文本。 */
  text() {
    if (!this._doc) return "";
    const pages = this._doc.getPages();
    return shownIndexes(this._doc, this.page).map((i) => {
      const ex = pages[i].extract();
      return ex && ex.text ? ex.text : "";
    }).join("\n");
  }
  /** 指定页（1-based，默认当前页或第 1 页）的 layout。 */
  layout(page = 0) {
    if (!this._doc) return null;
    const pages = this._doc.getPages();
    let i = Math.floor(Number(page)) - 1;
    if (i < 0) i = shownIndexes(this._doc, this.page)[0] ?? 0;
    return pages[i] ? pages[i].layout() : null;
  }
};
function definePdfElement(tag = TAG) {
  if (typeof customElements === "undefined") return tag;
  if (!customElements.get(tag)) customElements.define(tag, NiqerPdf);
  return tag;
}
definePdfElement();

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/fonts/ttf.js
function u16(b, o) {
  return (b[o] ?? 0) << 8 | (b[o + 1] ?? 0);
}
function u32(b, o) {
  return (b[o] ?? 0) * 16777216 + ((b[o + 1] ?? 0) << 16) + ((b[o + 2] ?? 0) << 8) + (b[o + 3] ?? 0) >>> 0;
}
function tagAt(b, o) {
  return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
}
function writeU16(b, o, v) {
  b[o] = v >>> 8 & 255;
  b[o + 1] = v & 255;
}
function writeU32(b, o, v) {
  b[o] = v >>> 24 & 255;
  b[o + 1] = v >>> 16 & 255;
  b[o + 2] = v >>> 8 & 255;
  b[o + 3] = v & 255;
}
function asBytes(src) {
  if (!src) return null;
  if (src instanceof Uint8Array) return src;
  return new Uint8Array(src);
}
function tableDir(sfnt, base = 0) {
  const scaler = u32(sfnt, base);
  if (scaler === 1330926671) throw new PdfError("CFF/OTF fonts are not supported");
  const n2 = u16(sfnt, base + 4);
  const tables = /* @__PURE__ */ new Map();
  for (let i = 0; i < n2; i++) {
    const o = base + 12 + i * 16;
    tables.set(tagAt(sfnt, o), { off: u32(sfnt, o + 8), len: u32(sfnt, o + 12) });
  }
  if (tables.has("CFF ") || tables.has("CFF2")) throw new PdfError("CFF/OTF fonts are not supported");
  return tables;
}
function sliceTable(sfnt, tables, tag) {
  const t = tables.get(tag);
  if (!t) return null;
  return sfnt.subarray(t.off, t.off + t.len);
}
function decodeUtf16Be(bytes) {
  let s = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    s += String.fromCharCode(bytes[i] << 8 | bytes[i + 1]);
  }
  return s;
}
function faceNames(sfnt, tables) {
  const name = sliceTable(sfnt, tables, "name");
  if (!name || name.length < 6) return [];
  const count = u16(name, 2);
  const stringOff = u16(name, 4);
  const out = [];
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 12;
    const plat = u16(name, o);
    const enc = u16(name, o + 2);
    const id = u16(name, o + 6);
    const len = u16(name, o + 8);
    const off = u16(name, o + 10);
    if (id !== 1 && id !== 4 && id !== 6) continue;
    const raw = name.subarray(stringOff + off, stringOff + off + len);
    let text = "";
    if (plat === 3 || plat === 0 && enc !== 0) text = decodeUtf16Be(raw);
    else {
      for (const c of raw) text += String.fromCharCode(c);
    }
    if (text) out.push(text);
  }
  return out;
}
function pickTtcFaceOffset(bytes, faceName) {
  if (tagAt(bytes, 0) !== "ttcf") return 0;
  const n2 = u32(bytes, 8);
  const want = String(faceName || "").toLowerCase();
  let fallback = u32(bytes, 12);
  for (let i = 0; i < n2; i++) {
    const off = u32(bytes, 12 + i * 4);
    if (!fallback) fallback = off;
    if (!want) continue;
    const tables = tableDir(bytes, off);
    const names = faceNames(bytes, tables).map((s) => s.toLowerCase());
    if (names.some((s) => s === want || s.includes(want) || want.includes(s))) return off;
  }
  return fallback || 0;
}
function checksum(bytes) {
  const n2 = Math.ceil(bytes.length / 4);
  let sum = 0;
  for (let i = 0; i < n2; i++) {
    const o = i * 4;
    const v = (bytes[o] || 0) << 24 | (bytes[o + 1] || 0) << 16 | (bytes[o + 2] || 0) << 8 | (bytes[o + 3] || 0);
    sum = sum + v >>> 0;
  }
  return sum;
}
function pad4(bytes) {
  const n2 = (4 - bytes.length % 4) % 4;
  if (!n2) return bytes;
  const out = new Uint8Array(bytes.length + n2);
  out.set(bytes);
  return out;
}
function assembleSfnt(tables) {
  const tags = [...tables.keys()].sort();
  const n2 = tags.length;
  let search = 1;
  let entry = 0;
  while (search * 2 <= n2) {
    search *= 2;
    entry++;
  }
  search *= 16;
  const header = 12 + n2 * 16;
  const padded = [];
  let off = header;
  for (const tag of tags) {
    const raw = pad4(tables.get(tag));
    padded.push({ tag, raw, off, len: tables.get(tag).length });
    off += raw.length;
  }
  const file = new Uint8Array(off);
  writeU32(file, 0, 65536);
  writeU16(file, 4, n2);
  writeU16(file, 6, search);
  writeU16(file, 8, entry);
  writeU16(file, 10, n2 * 16 - search);
  for (let i = 0; i < padded.length; i++) {
    const t = padded[i];
    const o = 12 + i * 16;
    file[o] = t.tag.charCodeAt(0);
    file[o + 1] = t.tag.charCodeAt(1);
    file[o + 2] = t.tag.charCodeAt(2);
    file[o + 3] = t.tag.charCodeAt(3);
    writeU32(file, o + 4, checksum(t.raw));
    writeU32(file, o + 8, t.off);
    writeU32(file, o + 12, t.len);
    file.set(t.raw, t.off);
  }
  const head = tables.get("head");
  if (head && head.length >= 12) {
    const headOff = padded.find((p) => p.tag === "head").off;
    writeU32(file, headOff + 8, 0);
    const adj = 2981146554 - checksum(file) >>> 0;
    writeU32(file, headOff + 8, adj);
  }
  return file;
}
function sanitizeWebSfnt(src, faceName) {
  const bytes = asBytes(src);
  if (!bytes || bytes.length < 12) return bytes;
  if (tagAt(bytes, 0) !== "ttcf") {
    try {
      const dir = tableDir(bytes, 0);
      const cvt = dir.get("cvt ");
      if (!cvt || (cvt.len & 3) === 0) return bytes;
    } catch {
      return bytes;
    }
  }
  try {
    const faceOff = pickTtcFaceOffset(bytes, faceName);
    const dir = tableDir(bytes, faceOff);
    const tables = /* @__PURE__ */ new Map();
    for (const [tag, loc] of dir) {
      let slice = bytes.subarray(loc.off, loc.off + loc.len);
      if (tag === "cvt ") slice = pad4(slice);
      tables.set(tag, slice.slice());
    }
    return assembleSfnt(tables);
  } catch {
    return bytes;
  }
}

// ../../node_modules/.pnpm/@niqer+pdf@https+++codeload_e8b13f95d5a7d6ec21a210a1194ff0e1/node_modules/@niqer/pdf/src/layout/paint.js
var FILL_OPS2 = /* @__PURE__ */ new Set(["f", "F", "f*", "B", "B*", "b", "b*"]);
var STROKE_OPS = /* @__PURE__ */ new Set(["S", "s", "B", "B*", "b", "b*"]);
var EVEN_ODD = /* @__PURE__ */ new Set(["f*", "B*", "b*"]);
function nums2(args) {
  const out = [];
  for (const a of args) {
    const n2 = asNum(a);
    if (n2 !== void 0)
      out.push(n2);
  }
  return out;
}
function asPdfString2(obj) {
  return obj instanceof PdfString ? obj : void 0;
}
function namedResource2(resources, category, name, resolve) {
  if (!resources)
    return void 0;
  const cat = resources.get(category);
  if (!cat)
    return void 0;
  const dict = asDict(resolve(cat));
  if (!dict)
    return void 0;
  const value = dict.get(name);
  return value !== void 0 ? resolve(value) : void 0;
}
function colorKind2(arg, ctx) {
  const name = asName(arg);
  if (name === "DeviceRGB" || name === "RGB")
    return "rgb";
  if (name === "DeviceGray" || name === "G")
    return "gray";
  if (name === "DeviceCMYK" || name === "CMYK")
    return "cmyk";
  return name ? "rgb" : "unknown";
}
function loadFontMap2(resources, resolve, fileMap) {
  const map = /* @__PURE__ */ new Map();
  if (!resources)
    return map;
  const raw = resources.get("Font");
  if (!raw)
    return map;
  const fontDict = asDict(resolve(raw));
  if (!fontDict)
    return map;
  for (const [key, value] of fontDict.entries) {
    const fd = asDict(resolve(value));
    if (!fd)
      continue;
    const metrics = loadFontMetrics(fd, resolve, key);
    const file = fileMap && fileMap.get(key);
    const data = file && file.data != null ? file.data : fontFileFromDict(fd, resolve).data;
    const fallbackFamily = mapBaseFontMeta(metrics.baseFont || key).family;
    map.set(key, {
      ...metrics,
      family: paintFontFamily(metrics.baseFont || key, data),
      fallbackFamily
    });
  }
  return map;
}
function loadExtG(resources, resolve) {
  const map = /* @__PURE__ */ new Map();
  if (!resources)
    return map;
  const raw = resources.get("ExtGState");
  if (!raw)
    return map;
  const dict = asDict(resolve(raw));
  if (!dict)
    return map;
  for (const [key, value] of dict.entries) {
    const eg = asDict(resolve(value));
    if (!eg)
      continue;
    map.set(key, {
      ca: asNum(eg.get("ca")),
      CA: asNum(eg.get("CA"))
    });
  }
  return map;
}
function defaultGs2() {
  return {
    fillKind: "rgb",
    strokeKind: "rgb",
    fontKey: null,
    fontSize: 1,
    tz: 100,
    tc: 0,
    tw: 0,
    leading: 0,
    Tm: ident(),
    Tlm: ident()
  };
}
function cloneGs2(gs) {
  return {
    ...gs,
    Tm: cloneMat(gs.Tm),
    Tlm: cloneMat(gs.Tlm)
  };
}
function asBoxMatrix2(obj) {
  const arr = asArray(obj);
  if (!arr || arr.items.length < 6)
    return void 0;
  const n2 = arr.items.map((i) => asNum(i));
  if (n2.some((v) => v === void 0))
    return void 0;
  return [n2[0], n2[1], n2[2], n2[3], n2[4], n2[5]];
}
function applyFill(ctx, rgb) {
  ctx.fillStyle = rgbToHex(rgb, { exact: true });
}
function applyStroke(ctx, rgb) {
  ctx.strokeStyle = rgbToHex(rgb, { exact: true });
}
function runtimeFonts() {
  if (typeof document !== "undefined" && document.fonts) return document.fonts;
  if (typeof self !== "undefined" && self.fonts) return self.fonts;
  return null;
}
async function defaultLoadImage(url) {
  if (typeof createImageBitmap === "function" && typeof fetch === "function") {
    const res = await fetch(url);
    const blob = await res.blob();
    return createImageBitmap(blob);
  }
  if (typeof Image === "undefined")
    throw new PdfError("paintPage requires opts.loadImage in this environment");
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new PdfError("Failed to load image"));
    img.src = url;
  });
}
var loadedFaceIds = /* @__PURE__ */ new Set();
async function ensureFonts(embedded, opts) {
  const list = embedded || [];
  const register = opts.registerFont;
  if (register) {
    for (const f of list) {
      if (!f.data || f.data.length < 100)
        continue;
      const id = paintFontFamily(f.baseFont || f.resourceKey, f.data);
      let bytes = f.data;
      try {
        bytes = sanitizeWebSfnt(f.data);
      } catch {
        bytes = f.data;
      }
      register(id, bytes);
    }
    return;
  }
  const faces = runtimeFonts();
  if (typeof FontFace === "undefined" || !faces)
    return;
  const jobs = [];
  for (const f of list) {
    if (!f.data || f.data.length < 100)
      continue;
    const id = paintFontFamily(f.baseFont || f.resourceKey, f.data);
    if (loadedFaceIds.has(id)) continue;
    let clean;
    try {
      clean = sanitizeWebSfnt(f.data);
    } catch {
      continue;
    }
    const copy = clean.buffer.slice(clean.byteOffset, clean.byteOffset + clean.byteLength);
    jobs.push((async () => {
      try {
        const face = new FontFace(id, copy);
        await Promise.race([
          face.load(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("font timeout")), 800))
        ]);
        faces.add(face);
        loadedFaceIds.add(id);
      } catch {
        loadedFaceIds.add(id);
      }
    })());
  }
  if (jobs.length)
    await Promise.all(jobs);
}
function yieldPaint() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
async function paintPage(page, ctx, opts = {}) {
  const scale = opts.scale || 1;
  const w = Math.max(1, page.width * scale);
  const h = Math.max(1, page.height * scale);
  const yieldEvery = opts.yieldEvery == null ? typeof document !== "undefined" ? 160 : 0 : opts.yieldEvery;
  const embedded = page.embeddedFonts ? page.embeddedFonts() : [];
  await ensureFonts(embedded, opts);
  const fileMap = /* @__PURE__ */ new Map();
  for (const f of embedded) fileMap.set(f.resourceKey, f);
  const loadImage = opts.loadImage || defaultLoadImage;
  const imageCache = /* @__PURE__ */ new Map();
  let resources = page.resolvedResources();
  const resolve = page.resolve || ((o) => o);
  let fonts = !page.writable && page._paintFontMap;
  if (!fonts) {
    fonts = loadFontMap2(resources, resolve, fileMap);
    if (!page.writable) page._paintFontMap = fonts;
  }
  let extG = loadExtG(resources, resolve);
  let formDepth = 0;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(scale, 0, 0, -scale, 0, h);
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.textBaseline = "alphabetic";
  const stack = [];
  let gs = defaultGs2();
  applyFill(ctx, [0, 0, 0]);
  applyStroke(ctx, [0, 0, 0]);
  ctx.beginPath();
  const td = (tx, ty) => {
    gs.Tlm = matMul(gs.Tlm, translate(tx, ty));
    gs.Tm = cloneMat(gs.Tlm);
  };
  const paintPath = (op) => {
    if (FILL_OPS2.has(op))
      ctx.fill(EVEN_ODD.has(op) ? "evenodd" : "nonzero");
    if (STROKE_OPS.has(op))
      ctx.stroke();
    ctx.beginPath();
  };
  const show = (str) => {
    const font = gs.fontKey ? fonts.get(gs.fontKey) : null;
    const text = decodeShowString(font, str);
    const th = gs.tz / 100;
    if (text) {
      const family = font?.family || "sans-serif";
      const fallback = font?.fallbackFamily;
      ctx.save();
      const tm = gs.Tm;
      ctx.transform(tm[0], tm[1], tm[2], tm[3], tm[4], tm[5]);
      ctx.scale(th, -1);
      ctx.font = fallback && fallback !== family ? `${gs.fontSize}px "${family}", "${fallback}", sans-serif` : `${gs.fontSize}px "${family}", sans-serif`;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    const wEm = stringWidthEm(font, str.bytes);
    let extra = 0;
    if (font?.isCid) {
      for (let i = 0; i + 1 < str.bytes.length; i += 2)
        extra += gs.tc;
    } else {
      for (let i = 0; i < str.bytes.length; i++) {
        extra += gs.tc;
        if (str.bytes[i] === 32)
          extra += gs.tw;
      }
    }
    const advance = wEm / 1e3 * gs.fontSize * th + extra * th;
    gs.Tm = matMul(gs.Tm, translate(advance, 0));
  };
  const drawXObject = async (name) => {
    const obj = namedResource2(resources, "XObject", name, resolve);
    if (!obj)
      return;
    const dict = asDict(obj);
    const subtype = dict ? asName(dict.get("Subtype")) : void 0;
    if (subtype === "Form" && obj instanceof PdfStream) {
      if (formDepth > 8)
        return;
      const formMatrix = asBoxMatrix2(dict.get("Matrix")) ?? ident();
      const formRes = dict.get("Resources");
      const nestedRes = formRes ? asDict(resolve(formRes)) ?? resources : resources;
      const nestedFonts = loadFontMap2(nestedRes, resolve, fileMap);
      const nestedExt = loadExtG(nestedRes, resolve);
      const prevRes = resources;
      const prevFonts = fonts;
      const prevExt = extG;
      resources = nestedRes;
      fonts = nestedFonts.size ? nestedFonts : prevFonts;
      extG = nestedExt.size ? nestedExt : prevExt;
      formDepth++;
      ctx.save();
      ctx.transform(formMatrix[0], formMatrix[1], formMatrix[2], formMatrix[3], formMatrix[4], formMatrix[5]);
      const bbox = asBox(dict.get("BBox"));
      if (bbox) {
        ctx.beginPath();
        ctx.moveTo(bbox[0], bbox[1]);
        ctx.lineTo(bbox[2], bbox[1]);
        ctx.lineTo(bbox[2], bbox[3]);
        ctx.lineTo(bbox[0], bbox[3]);
        ctx.closePath();
        ctx.clip();
        ctx.beginPath();
      }
      await replayOps(parseContent(decodeStream(obj)), env, yieldEvery);
      ctx.restore();
      resources = prevRes;
      fonts = prevFonts;
      extG = prevExt;
      formDepth--;
      return;
    }
    if (subtype === "Image" || obj instanceof PdfStream) {
      let decoded = imageCache.get(name);
      if (!decoded) {
        decoded = decodeImageXObject(obj);
        imageCache.set(name, decoded);
      }
      if (!decoded?.dataUrl)
        return;
      const img = await loadImage(decoded.dataUrl);
      ctx.save();
      ctx.transform(1, 0, 0, -1, 0, 1);
      ctx.drawImage(img, 0, 0, 1, 1);
      ctx.restore();
    }
  };
  const env = {
    ctx,
    get gs() {
      return gs;
    },
    set gs(v) {
      gs = v;
    },
    stack,
    get fonts() {
      return fonts;
    },
    get extG() {
      return extG;
    },
    get resources() {
      return resources;
    },
    resolve,
    show,
    paintPath,
    td,
    drawXObject,
    loadImage,
    imageCache
  };
  await replayOps(page.contentOperators(), env, yieldEvery);
  ctx.restore();
}
async function replayOps(ops, env, yieldEvery) {
  const { ctx, stack, extG, show, paintPath, td, drawXObject } = env;
  const step = yieldEvery > 0 ? yieldEvery : 0;
  for (let i = 0; i < ops.length; i++) {
    if (step && i > 0 && i % step === 0) await yieldPaint();
    const op = ops[i];
    const n2 = nums2(op.args);
    switch (op.op) {
      case "q":
        ctx.save();
        stack.push(cloneGs2(env.gs));
        break;
      case "Q": {
        ctx.restore();
        const prev = stack.pop();
        if (prev)
          env.gs = prev;
        break;
      }
      case "cm":
        if (n2.length >= 6)
          ctx.transform(n2[0], n2[1], n2[2], n2[3], n2[4], n2[5]);
        break;
      case "w":
        if (n2[0] !== void 0)
          ctx.lineWidth = Math.max(0, n2[0]);
        break;
      case "J":
        ctx.lineCap = n2[0] === 1 ? "round" : n2[0] === 2 ? "square" : "butt";
        break;
      case "j":
        ctx.lineJoin = n2[0] === 1 ? "round" : n2[0] === 2 ? "bevel" : "miter";
        break;
      case "d": {
        const arr = asArray(op.args[0]);
        const dash = arr ? arr.items.map((i2) => asNum(i2)).filter((v) => v !== void 0) : [];
        ctx.setLineDash(dash);
        const phase = asNum(op.args[1]);
        if (phase !== void 0)
          ctx.lineDashOffset = phase;
        break;
      }
      case "gs": {
        const name = asName(op.args[0]);
        const eg = name ? extG.get(name) : null;
        if (eg?.ca !== void 0 && eg.ca !== null)
          ctx.globalAlpha = Math.max(0, Math.min(1, eg.ca));
        break;
      }
      case "m":
        if (n2.length >= 2)
          ctx.moveTo(n2[0], n2[1]);
        break;
      case "l":
        if (n2.length >= 2)
          ctx.lineTo(n2[0], n2[1]);
        break;
      case "c":
        if (n2.length >= 6)
          ctx.bezierCurveTo(n2[0], n2[1], n2[2], n2[3], n2[4], n2[5]);
        break;
      case "v":
        if (n2.length >= 4)
          ctx.quadraticCurveTo(n2[0], n2[1], n2[2], n2[3]);
        break;
      case "y":
        if (n2.length >= 4)
          ctx.bezierCurveTo(n2[0], n2[1], n2[0], n2[1], n2[2], n2[3]);
        break;
      case "h":
        ctx.closePath();
        break;
      case "re":
        if (n2.length >= 4) {
          ctx.moveTo(n2[0], n2[1]);
          ctx.lineTo(n2[0] + n2[2], n2[1]);
          ctx.lineTo(n2[0] + n2[2], n2[1] + n2[3]);
          ctx.lineTo(n2[0], n2[1] + n2[3]);
          ctx.closePath();
        }
        break;
      case "n":
        ctx.beginPath();
        break;
      case "W":
      case "W*":
        ctx.clip(op.op === "W*" ? "evenodd" : "nonzero");
        ctx.beginPath();
        break;
      case "f":
      case "F":
      case "f*":
      case "B":
      case "B*":
      case "b":
      case "b*":
      case "S":
      case "s":
        paintPath(op.op);
        break;
      case "cs":
        env.gs.fillKind = colorKind2(op.args[0], env);
        break;
      case "CS":
        env.gs.strokeKind = colorKind2(op.args[0], env);
        break;
      case "sc":
      case "scn":
        applyFill(ctx, componentsToRgb(env.gs.fillKind, n2));
        break;
      case "SC":
      case "SCN":
        applyStroke(ctx, componentsToRgb(env.gs.strokeKind, n2));
        break;
      case "g":
        env.gs.fillKind = "gray";
        applyFill(ctx, componentsToRgb("gray", n2));
        break;
      case "G":
        env.gs.strokeKind = "gray";
        applyStroke(ctx, componentsToRgb("gray", n2));
        break;
      case "rg":
        env.gs.fillKind = "rgb";
        applyFill(ctx, componentsToRgb("rgb", n2));
        break;
      case "RG":
        env.gs.strokeKind = "rgb";
        applyStroke(ctx, componentsToRgb("rgb", n2));
        break;
      case "k":
        env.gs.fillKind = "cmyk";
        applyFill(ctx, componentsToRgb("cmyk", n2));
        break;
      case "K":
        env.gs.strokeKind = "cmyk";
        applyStroke(ctx, componentsToRgb("cmyk", n2));
        break;
      case "BT":
        env.gs.Tm = ident();
        env.gs.Tlm = ident();
        break;
      case "ET":
        break;
      case "Tc":
        if (n2[0] !== void 0)
          env.gs.tc = n2[0];
        break;
      case "Tw":
        if (n2[0] !== void 0)
          env.gs.tw = n2[0];
        break;
      case "Tz":
        if (n2[0] !== void 0)
          env.gs.tz = n2[0];
        break;
      case "TL":
        if (n2[0] !== void 0)
          env.gs.leading = n2[0];
        break;
      case "Tf": {
        const name = asName(op.args[0]);
        const size = asNum(op.args[1]);
        if (name)
          env.gs.fontKey = name;
        if (size !== void 0)
          env.gs.fontSize = size;
        break;
      }
      case "Tr":
      case "Ts":
        break;
      case "Td":
        if (n2.length >= 2)
          td(n2[0], n2[1]);
        break;
      case "TD":
        if (n2.length >= 2) {
          env.gs.leading = -n2[1];
          td(n2[0], n2[1]);
        }
        break;
      case "Tm":
        if (n2.length >= 6) {
          env.gs.Tm = [n2[0], n2[1], n2[2], n2[3], n2[4], n2[5]];
          env.gs.Tlm = cloneMat(env.gs.Tm);
        }
        break;
      case "T*":
        td(0, -env.gs.leading);
        break;
      case "Tj": {
        const s = asPdfString2(op.args[0]);
        if (s)
          show(s);
        break;
      }
      case "'": {
        td(0, -env.gs.leading);
        const s = asPdfString2(op.args[0]);
        if (s)
          show(s);
        break;
      }
      case "TJ": {
        const arr = asArray(op.args[0]);
        if (!arr)
          break;
        const th = env.gs.tz / 100;
        for (const item of arr.items) {
          const s = asPdfString2(item);
          if (s) {
            show(s);
            continue;
          }
          const adj = asNum(item);
          if (adj !== void 0)
            env.gs.Tm = matMul(env.gs.Tm, translate(-adj / 1e3 * env.gs.fontSize * th, 0));
        }
        break;
      }
      case "Do": {
        const name = asName(op.args[0]);
        if (name)
          await drawXObject(name);
        break;
      }
      default:
        break;
    }
  }
}

// src/print-tool/pdf-paint-worker.js
var docs = /* @__PURE__ */ new Map();
self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === "open") {
      const doc = PdfDocument.open(msg.buffer);
      const pages = doc.getPages();
      docs.set(msg.id, { doc, pages });
      self.postMessage({
        type: "opened",
        id: msg.id,
        pages: pages.map((page) => ({ width: page.width, height: page.height }))
      });
      return;
    }
    if (msg.type === "paint") {
      const rec = docs.get(msg.id);
      if (!rec || !rec.pages[msg.pageIndex]) throw new Error("page");
      const page = rec.pages[msg.pageIndex];
      const canvas = new OffscreenCanvas(msg.width, msg.height);
      const ctx = canvas.getContext("2d", { alpha: false });
      await paintPage(page, ctx, { scale: msg.scale, yieldEvery: 0 });
      const bitmap = canvas.transferToImageBitmap();
      self.postMessage({
        type: "painted",
        id: msg.id,
        pageIndex: msg.pageIndex,
        zoom: msg.zoom,
        bitmap
      }, [bitmap]);
      return;
    }
    if (msg.type === "close") {
      docs.delete(msg.id);
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      id: msg.id,
      pageIndex: msg.pageIndex,
      message: String(err && err.message ? err.message : err)
    });
  }
};
