function readMessage (data, status) {
  if (data && typeof data === 'object' && typeof data.message === 'string' && data.message) return data.message
  return 'HTTP ' + status
}

function notifyUnauthorized () {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('niqer-unauthorized'))
}

async function finish (res, req) {
  if (!res.ok) {
    if (res.status === 401) notifyUnauthorized()
    let data = null
    try { data = await res.clone().json() } catch { /* 非 JSON */ }
    const err = new Error(readMessage(data, res.status))
    err.status = res.status
    err.data = data
    throw err
  }
  if (res.status === 204) return null
  if (req.responseType === 'blob') return await res.blob()
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('json')) return await res.json()
  return await res.text()
}

export function createDefaultFetcher (getAuthHeaders) {
  return async function defaultFetcher (req) {
    const headers = Object.assign({}, typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}, req.headers || {})
    const init = { method: req.method || 'GET', headers }
    if (req.body instanceof FormData) {
      init.body = req.body
    } else if (req.body != null) {
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json'
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }
    if (req.timeout) {
      const ctrl = new AbortController()
      init.signal = ctrl.signal
      const timer = setTimeout(() => ctrl.abort(), req.timeout)
      try {
        const res = await fetch(req.url, init)
        return await finish(res, req)
      } finally {
        clearTimeout(timer)
      }
    }
    return finish(await fetch(req.url, init), req)
  }
}

export function createHttp (opts) {
  const getFetcher = () => opts.fetcher || createDefaultFetcher(() => opts.getAuthHeaders && opts.getAuthHeaders())
  const through = { through: 'true' }

  async function send (method, url, body, extra) {
    return getFetcher()({
      method,
      url,
      body,
      headers: Object.assign({}, through, extra && extra.headers),
      responseType: extra && extra.responseType,
      timeout: extra && extra.timeout
    })
  }

  return {
    get (url, extra) { return send('GET', url, null, extra) },
    put (url, body, extra) { return send('PUT', url, body, extra) },
    post (url, body, extra) { return send('POST', url, body, extra) },
    patch (url, body, extra) { return send('PATCH', url, body, extra) },
    delete (url, body, extra) { return send('DELETE', url, body, extra) }
  }
}
