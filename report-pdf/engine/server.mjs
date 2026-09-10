// report-pdf 边车服务:零依赖(Node 内置 http),内网友好。
// 契约:Java 后端负责取模板 + 跑 dsN 的 SQL 填充数据 + 业务参数映射;
//       本服务只收「已填 dataset 的模板 JSON」,返回确定性 PDF/XLSX 字节。
//
// 架构(P0-1):主线程只做 HTTP 收发 + 调度 + 缓存;实际 layout+draw 交给 worker 线程池,
//            大报表不再阻塞事件循环(健康检查始终可响应),卡死的渲染也能被主线程 terminate。
//
// 路由:
//   GET  /health        健康检查 + 字体注册状态 + 池/缓存指标
//   GET  /fonts/:key    HTML 预览外链字体(与 PDF 同文件;times/simhei/…)
//   POST /render        body = templateData(或 { templateData }),返回 application/pdf
//   POST /render/xlsx   同上,返回 xlsx
//   POST /render/html   同上,返回预排 text/html(预览专用)
//
// 生产字体:用环境变量覆盖为 Alpine/Linux 同源字体(度量=绘制必须同一批文件):
//   REPORT_FONT_TIMES / REPORT_FONT_SIMSUN / REPORT_FONT_SIMHEI / REPORT_FONT_SYMBOL
import './fonts.mjs'
import { setFontPaths, fontRegistration, fontHealth, FONT_BUFFERS, FONT_PATHS } from './fonts.mjs'
import { createRenderPool } from './pool.mjs'
import { createResultCache } from './cache.mjs'
import http from 'node:http'
import os from 'node:os'
import { URL } from 'node:url'

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8'

const FONT_KEYS = new Set(['times', 'timesBd', 'timesIt', 'timesBi', 'simsun', 'simhei', 'segoesym'])

function contentTypeForKind (kind) {
  if (kind === 'xlsx') return XLSX_CONTENT_TYPE
  if (kind === 'html') return HTML_CONTENT_TYPE
  return 'application/pdf'
}

function fontContentType (filePath) {
  const p = String(filePath || '').toLowerCase()
  if (p.endsWith('.woff2')) return 'font/woff2'
  if (p.endsWith('.woff')) return 'font/woff'
  if (p.endsWith('.otf')) return 'font/otf'
  if (p.endsWith('.ttc')) return 'font/collection'
  return 'font/ttf'
}

function handleFont (req, res, key) {
  if (!FONT_KEYS.has(key)) {
    sendJson(res, 404, { error: 'font not found' })
    return
  }
  const buf = FONT_BUFFERS[key]
  const filePath = FONT_PATHS[key]
  if (!buf || !buf.length) {
    sendJson(res, 404, { error: 'font not available' })
    return
  }
  res.writeHead(200, {
    'content-type': fontContentType(filePath),
    'content-length': buf.length,
    'cache-control': 'public, max-age=31536000, immutable',
    'access-control-allow-origin': '*'
  })
  res.end(buf)
}

const fontOverrides = {}
if (process.env.REPORT_FONT_TIMES) fontOverrides.times = process.env.REPORT_FONT_TIMES
if (process.env.REPORT_FONT_SIMSUN) fontOverrides.simsun = process.env.REPORT_FONT_SIMSUN
if (process.env.REPORT_FONT_SIMHEI) fontOverrides.simhei = process.env.REPORT_FONT_SIMHEI
if (process.env.REPORT_FONT_SYMBOL) fontOverrides.segoesym = process.env.REPORT_FONT_SYMBOL
if (Object.keys(fontOverrides).length > 0) setFontPaths(fontOverrides)

const PORT = Number(process.env.PORT || 7321)
const HOST = process.env.HOST || '127.0.0.1'
const MAX_BODY = Number(process.env.REPORT_MAX_BODY_BYTES || 64 * 1024 * 1024)

// 池规模默认 = min(逻辑核-1, 4),至少 1;可用 REPORT_WORKERS 覆盖。
const cpuCount = (os.cpus() || []).length || 2
const POOL_SIZE = Math.max(1, Number(process.env.REPORT_WORKERS || Math.min(cpuCount - 1, 4)))
const MAX_QUEUE = Number(process.env.REPORT_MAX_QUEUE || 100)
const JOB_TIMEOUT_MS = Number(process.env.REPORT_JOB_TIMEOUT_MS || 120000)
const WORKER_HEAP_MB = Number(process.env.REPORT_WORKER_HEAP_MB || 2048)

const pool = createRenderPool({ size: POOL_SIZE, maxQueue: MAX_QUEUE, jobTimeoutMs: JOB_TIMEOUT_MS, workerHeapMb: WORKER_HEAP_MB })

const cache = createResultCache({
  maxEntries: Number(process.env.REPORT_CACHE_MAX_ENTRIES ?? 64),
  maxBytes: Number(process.env.REPORT_CACHE_MAX_BYTES ?? 128 * 1024 * 1024),
  ttlMs: Number(process.env.REPORT_CACHE_TTL_MS || 0)
})

let reqSeq = 0
function nextReqId () { return Date.now().toString(36) + '-' + (++reqSeq).toString(36) }

function logLine (o) {
  // 单行结构化日志:便于 grep/采集。字段:ts reqId method path status pages els bytes ms cache
  console.log(JSON.stringify({ t: new Date().toISOString(), lvl: o.status >= 500 ? 'error' : (o.status >= 400 ? 'warn' : 'info'), ...o }))
}

function readBody (req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) { const e = new Error('request body too large'); e.status = 413; reject(e); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson (res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length })
  res.end(body)
}

async function handleRender (req, res, kind) {
  const reqId = nextReqId()
  const t0 = Date.now()
  let raw
  try {
    raw = await readBody(req)
  } catch (e) {
    const status = e.status || 400
    logLine({ reqId, method: req.method, path: req.url, status, bytes: 0, ms: Date.now() - t0, error: e.message })
    sendJson(res, status, { error: e.message })
    return
  }
  const gzipped = (req.headers['content-encoding'] || '').toLowerCase().includes('gzip')
  const watermark = String(req.headers['x-report-watermark'] || '') === '1'
  const cacheKey = cache.enabled ? cache.keyOf(kind, raw, watermark) : null
  let result = cacheKey ? cache.get(cacheKey) : null
  const cacheHit = Boolean(result)

  try {
    if (!result) {
      result = await pool.submit({ kind, body: raw, gzipped, watermark })
      if (cacheKey) cache.set(cacheKey, result)
    }
  } catch (e) {
    const status = e.status || 500
    logLine({ reqId, method: req.method, path: req.url, status, bytes: raw.length, ms: Date.now() - t0, cache: cacheHit ? 'hit' : 'miss', error: e.message })
    sendJson(res, status, { error: e.message })
    return
  }

  res.writeHead(200, {
    'content-type': contentTypeForKind(kind),
    'content-length': result.buffer.length,
    'x-report-pages': String(result.totalPages),
    'x-report-elements': String(result.elementCount),
    'x-report-ms': String(Date.now() - t0),
    'x-report-cache': cacheHit ? 'hit' : 'miss'
  })
  res.end(result.buffer)
  logLine({ reqId, method: req.method, path: req.url, status: 200, pages: result.totalPages, els: result.elementCount, bytes: raw.length, out: result.buffer.length, ms: Date.now() - t0, renderMs: result.ms, cache: cacheHit ? 'hit' : 'miss' })
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      // 始终返回 200(存活探针不因降级而重启);状态用 status/degraded 字段表达,供监控告警。
      const fh = fontHealth()
      sendJson(res, 200, {
        status: fh.degraded ? 'degraded' : 'ok',
        degraded: fh.degraded,
        reasons: fh.reasons,
        fontkit: fh.fontkit,
        lineHeightSource: fh.lineHeightSource,
        fonts: fh.fonts,
        pool: pool.stats(),
        cache: cache.stats()
      })
      return
    }
    if (req.method === 'GET' && req.url && req.url.startsWith('/fonts/')) {
      let key = ''
      try {
        key = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname.replace(/^\/fonts\//, ''))
      } catch {
        key = ''
      }
      handleFont(req, res, key)
      return
    }
    if (req.method === 'POST' && (req.url === '/render' || req.url === '/render/pdf')) {
      await handleRender(req, res, 'pdf')
      return
    }
    if (req.method === 'POST' && (req.url === '/render/xlsx' || req.url === '/render/excel')) {
      await handleRender(req, res, 'xlsx')
      return
    }
    if (req.method === 'POST' && req.url === '/render/html') {
      await handleRender(req, res, 'html')
      return
    }
    sendJson(res, 404, { error: 'not found' })
  } catch (e) {
    sendJson(res, 500, { error: (e && e.message) || String(e) })
  }
})

let activeRequests = 0
let shuttingDown = false

const originalHandler = server.listeners('request')[0]
server.removeAllListeners('request')
server.on('request', (req, res) => {
  if (shuttingDown) {
    res.writeHead(503, { connection: 'close' })
    res.end('{"error":"shutting down"}')
    return
  }
  activeRequests++
  res.on('close', () => { activeRequests-- })
  originalHandler(req, res)
})

function gracefulShutdown (signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received, draining ${activeRequests} in-flight request(s)...`)
  server.close(async () => {
    await pool.close()
    console.log('server closed, exiting')
    process.exit(0)
  })
  const deadline = setTimeout(() => {
    console.log('drain deadline reached, forcing exit')
    process.exit(1)
  }, 30_000)
  deadline.unref()
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

server.listen(PORT, HOST, () => {
  console.log(`report-pdf engine listening on http://${HOST}:${PORT}  workers=${POOL_SIZE} maxQueue=${MAX_QUEUE} cache=${cache.enabled}`)
  console.log('fonts:', Object.entries(fontRegistration).map(([k, v]) => `${k}=${v.registered ? 'OK' : 'MISS'}`).join(' '))
  // 启动字体自检:降级时用 warn 大声报出(便于日志采集/告警),但不阻断启动。
  const fh = fontHealth()
  if (fh.degraded) {
    console.warn(`[字体自检] DEGRADED (lineHeight=${fh.lineHeightSource}) —— 渲染可用但保真度下降:`)
    for (const r of fh.reasons) console.warn(`  - ${r}`)
  } else {
    console.log(`[字体自检] OK (lineHeight=${fh.lineHeightSource})`)
  }
})
