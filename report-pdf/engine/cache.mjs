// 渲染结果缓存(P2-9):按「请求体指纹 + 目标类型」缓存确定性产出字节。
// 边车渲染是纯确定性的(相同输入 → 相同字节),故同一单据重复打印/预览可直接命中,
// 省掉整套 expand/paginate/measure/draw。以 LRU + 字节总量上限约束内存。
//
// 说明:缓存键用「收到的原始请求体字节」的 sha256(gzip 与否各自成键,同客户端编码一致即稳定命中)。
// 若担心数据实时性,可用 REPORT_CACHE_MAX_ENTRIES=0 关闭。
import crypto from 'node:crypto'

export function createResultCache ({ maxEntries, maxBytes, ttlMs }) {
  const map = new Map()          // key -> { value, bytes, expireAt }
  let totalBytes = 0
  const enabled = maxEntries > 0 && maxBytes > 0

  const evictExpired = (now) => {
    if (!ttlMs) return
    for (const [k, e] of map) {
      if (e.expireAt <= now) { map.delete(k); totalBytes -= e.bytes }
    }
  }

  const evictToFit = (incomingBytes) => {
    while (map.size > 0 && (map.size >= maxEntries || totalBytes + incomingBytes > maxBytes)) {
      const oldestKey = map.keys().next().value    // Map 迭代按插入序,最旧在前
      const e = map.get(oldestKey)
      map.delete(oldestKey)
      totalBytes -= e ? e.bytes : 0
    }
  }

  return {
    enabled,
    keyOf (kind, rawBody, watermark) {
      return kind + ':' + (watermark ? 'w1:' : 'w0:') + crypto.createHash('sha256').update(rawBody).digest('hex')
    },
    get (key) {
      if (!enabled) return null
      const e = map.get(key)
      if (!e) return null
      if (ttlMs && e.expireAt <= Date.now()) { map.delete(key); totalBytes -= e.bytes; return null }
      // LRU:命中后移到末尾(最近使用)
      map.delete(key); map.set(key, e)
      return e.value
    },
    set (key, value) {
      if (!enabled) return
      const bytes = value && value.buffer ? value.buffer.length : 0
      if (bytes <= 0 || bytes > maxBytes) return   // 单个超过总上限的不缓存
      const now = Date.now()
      evictExpired(now)
      if (map.has(key)) { const old = map.get(key); totalBytes -= old.bytes; map.delete(key) }
      evictToFit(bytes)
      map.set(key, { value, bytes, expireAt: ttlMs ? now + ttlMs : Infinity })
      totalBytes += bytes
    },
    stats () { return { entries: map.size, bytes: totalBytes, enabled } }
  }
}
