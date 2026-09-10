// 渲染 worker(P0-1):在独立线程里跑 CPU 密集的 layout+draw,主线程只做 HTTP 与调度,
// 大报表不再阻塞事件循环(健康检查始终可响应),卡死的渲染也能被主线程 terminate 掉。
//
// 消息契约(主线程 → worker):{ id, kind:'pdf'|'xlsx'|'html', body:ArrayBuffer, gzipped:boolean }
// 回执(worker → 主线程): 成功 { id, ok:true, buffer:ArrayBuffer, totalPages, elementCount, ms }
//                          失败 { id, ok:false, status, error }
// fonts.mjs 必须最先 import(装垫片 + 按环境变量注册同源字体;Worker 继承 process.env)。
import './fonts.mjs'
import { renderTemplateToPdfBuffer, renderTemplateToXlsxBuffer, renderTemplateToHtmlBuffer } from './render.mjs'
import { parentPort } from 'node:worker_threads'
import zlib from 'node:zlib'

// 数据行防爆闸:dataset 顶层数组的最大长度(展开前的廉价上界),超限直接拒绝,
// 避免超大报表在 worker 里吃满 CPU/内存。默认 200000,高于后端 max-rows(100000)仅作兜底。
const MAX_DATA_ROWS = Number(process.env.REPORT_MAX_DATA_ROWS || 200000)

function maxDatasetRows (dataset) {
  if (!dataset || typeof dataset !== 'object') return 0
  let max = 0
  for (const v of Object.values(dataset)) {
    if (Array.isArray(v) && v.length > max) max = v.length
  }
  return max
}

parentPort.on('message', async (msg) => {
  const { id, kind } = msg
  try {
    let raw = Buffer.from(msg.body)             // 主线程转移进来的 ArrayBuffer
    if (msg.gzipped) raw = zlib.gunzipSync(raw)

    let templateData
    try { templateData = JSON.parse(raw.toString('utf8')) } catch {
      parentPort.postMessage({ id, ok: false, status: 400, error: 'invalid JSON body' }); return
    }
    if (templateData && templateData.templateData) templateData = templateData.templateData
    if (!templateData || !Array.isArray(templateData.elements)) {
      parentPort.postMessage({ id, ok: false, status: 400, error: 'templateData.elements missing' }); return
    }

    const rows = maxDatasetRows(templateData.dataset)
    if (rows > MAX_DATA_ROWS) {
      parentPort.postMessage({ id, ok: false, status: 413, error: `dataset rows ${rows} exceeds limit ${MAX_DATA_ROWS}` }); return
    }

    const t0 = Date.now()
    const opts = { watermark: !!msg.watermark }
    const render = kind === 'xlsx'
      ? renderTemplateToXlsxBuffer
      : (kind === 'html' ? renderTemplateToHtmlBuffer : renderTemplateToPdfBuffer)
    const { buffer, totalPages, elementCount } = await render(templateData, opts)
    const ms = Date.now() - t0

    // 以 ArrayBuffer 形式零拷贝转移回主线程(切出精确视图,避免带上 Buffer 池的多余字节)。
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    parentPort.postMessage({ id, ok: true, buffer: ab, totalPages, elementCount, ms }, [ab])
  } catch (e) {
    parentPort.postMessage({ id, ok: false, status: 500, error: (e && e.message) || String(e) })
  }
})

// 就绪信号:池在收到后才把该 worker 计入可用。
parentPort.postMessage({ ready: true })
