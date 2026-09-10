// 渲染 worker 池(P0-1):固定 size 个 worker 并行渲染,主线程只调度。
//  - 有空闲 worker 直接派发;否则入队;队列超 maxQueue 则背压(拒绝,由上层回 503)。
//  - 单任务超时:worker 卡在同步渲染无法自我中断,由池 terminate 掉并回 504,再补一个 worker。
//  - worker 崩溃/退出:失败其在办任务并自动补齐池规模,服务不整体挂。
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_FILE = path.join(__dirname, 'render-worker.mjs')

export function createRenderPool ({ size, maxQueue, jobTimeoutMs, workerHeapMb }) {
  const records = []          // { worker, busy, job }
  const queue = []            // 待派发的 job
  let seq = 0
  let closing = false

  // 单 worker 堆上限:超大报表撑爆某个 worker 时,只让它 OOM 退出(该任务回 500)并自动补齐,
  // 而不是整容器被 OOM Killer 杀掉。0 表示不限制(用 Node 默认)。
  const resourceLimits = workerHeapMb > 0
    ? { maxOldGenerationSizeMb: workerHeapMb, maxYoungGenerationSizeMb: Math.max(32, Math.floor(workerHeapMb / 8)) }
    : undefined

  function spawn () {
    const worker = new Worker(WORKER_FILE, resourceLimits ? { resourceLimits } : undefined)
    const rec = { worker, busy: false, job: null, killed: false }

    worker.on('message', (msg) => {
      if (msg && msg.ready) return
      const job = rec.job
      if (!job || job.id !== msg.id) return
      settle(rec, () => {
        if (msg.ok) {
          job.resolve({ buffer: Buffer.from(msg.buffer), totalPages: msg.totalPages, elementCount: msg.elementCount, ms: msg.ms })
        } else {
          job.reject(mkErr(msg.error, msg.status || 500))
        }
      })
    })

    worker.on('error', (err) => {
      // worker 线程抛未捕获错误:失败在办任务,标记待重建(exit 会随后触发)。
      if (rec.job) settle(rec, () => rec.job && rec.job.reject(mkErr('render worker error: ' + err.message, 500)), true)
      rec.killed = true
    })

    worker.on('exit', () => {
      if (rec.job) {
        // 退出时仍有在办任务(非超时主动 kill 场景):判定失败。
        const job = rec.job
        rec.job = null
        job.reject(mkErr('render worker exited unexpectedly', 500))
      }
      const idx = records.indexOf(rec)
      if (idx >= 0) records.splice(idx, 1)
      if (!closing) spawn()      // 补齐池规模
    })

    records.push(rec)
    return rec
  }

  // 收尾一个任务:清定时器、置空闲、触发下一轮派发。skipClearJob 用于 error→exit 两段式避免重复。
  function settle (rec, apply, keepForExit = false) {
    if (rec.timer) { clearTimeout(rec.timer); rec.timer = null }
    apply()
    if (!keepForExit) rec.job = null
    rec.busy = false
    pump()
  }

  function mkErr (message, status) { const e = new Error(message); e.status = status; return e }

  function dispatch (rec, job) {
    rec.busy = true
    rec.job = job
    rec.timer = setTimeout(() => {
      // 卡死的同步渲染无法被 postMessage 打断,只能 terminate 掉这个 worker。
      rec.killed = true
      const j = rec.job
      rec.job = null
      rec.busy = false
      if (j) j.reject(mkErr(`render timeout after ${jobTimeoutMs}ms`, 504))
      rec.worker.terminate()     // 触发 exit → 自动补一个新 worker
    }, jobTimeoutMs)
    rec.timer.unref && rec.timer.unref()

    // 以 ArrayBuffer 零拷贝转移请求体进 worker(主线程不解析大 JSON)。
    const body = job.body
    const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
    job.body = null            // 已交给 worker,主线程释放引用
    rec.worker.postMessage({ id: job.id, kind: job.kind, body: ab, gzipped: job.gzipped, watermark: job.watermark }, [ab])
  }

  function pump () {
    if (queue.length === 0) return
    const rec = records.find(r => !r.busy && !r.killed)
    if (!rec) return
    dispatch(rec, queue.shift())
  }

  for (let i = 0; i < size; i++) spawn()

  return {
    submit ({ kind, body, gzipped, watermark }) {
      return new Promise((resolve, reject) => {
        if (closing) { reject(mkErr('server shutting down', 503)); return }
        const job = { id: ++seq, kind, body, gzipped: Boolean(gzipped), watermark: Boolean(watermark), resolve, reject }
        const rec = records.find(r => !r.busy && !r.killed)
        if (rec) { dispatch(rec, job); return }
        if (queue.length >= maxQueue) { reject(mkErr('render pool saturated', 503)); return }
        queue.push(job)
      })
    },
    stats () {
      return { size, workers: records.length, busy: records.filter(r => r.busy).length, queued: queue.length, maxQueue }
    },
    async close () {
      closing = true
      while (queue.length) queue.shift().reject(mkErr('server shutting down', 503))
      await Promise.all(records.map(r => r.worker.terminate().catch(() => {})))
    }
  }
}
