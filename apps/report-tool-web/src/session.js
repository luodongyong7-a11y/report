const TOKEN_KEY = 'report-tool-token'
const USER_KEY = 'report-tool-user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

function decodePayload (token) {
  const raw = String(token || '')
  const dot = raw.indexOf('.')
  if (dot <= 0) return ''
  let b64 = raw.slice(0, dot).replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  try {
    return atob(b64)
  } catch {
    return ''
  }
}

export function isSessionExpired (token) {
  const t = token == null ? getToken() : token
  if (!t) return true
  const payload = decodePayload(t)
  const sep = payload.lastIndexOf('|')
  if (sep <= 0) return true
  const exp = Number(payload.slice(sep + 1))
  return !Number.isFinite(exp) || exp < Date.now()
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token || '')
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
