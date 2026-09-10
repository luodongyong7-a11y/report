import { getToken } from './session.js'

function notifyUnauthorized () {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('niqer-unauthorized'))
}

async function readBody (res) {
  if (res.status === 204) return null
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('json')) return res.json()
  return res.text()
}

async function send (method, url, body) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = 'Bearer ' + token
  const init = { method, headers }
  if (body != null) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(url, init)
  if (!res.ok) {
    if (res.status === 401 && !String(url).includes('/auth/login')) {
      notifyUnauthorized()
    }
    let message = 'request failed'
    try {
      const data = await res.json()
      if (data && data.message) message = data.message
    } catch {
      message = res.statusText || message
    }
    throw new Error(message)
  }
  return readBody(res)
}

const http = {
  get (url) { return send('GET', url) },
  put (url, body) { return send('PUT', url, body) },
  post (url, body) { return send('POST', url, body) },
  delete (url) { return send('DELETE', url) }
}

export default http
