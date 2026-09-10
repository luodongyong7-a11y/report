// 外壳:登录 / 路由 / 头像退出,插件 HTTP 适配器在此注入,不把 /report/tool 写进报表工具
import { createDatasourcePlugin, createStoragePlugin } from './plugins.js'
import { clearSession, getToken, isSessionExpired } from './session.js'
import http from './http.js'
import './login.js'
import './account.js'

function pathOf () {
  return window.location.pathname || '/'
}

function go (path) {
  if (pathOf() === path) return
  window.history.pushState({}, '', path)
}

function hasSession () {
  if (!getToken()) return false
  if (isSessionExpired()) {
    clearSession()
    return false
  }
  return true
}

function authHeaders () {
  return hasSession() ? { Authorization: 'Bearer ' + getToken() } : {}
}

class ReportToolApp extends HTMLElement {
  connectedCallback () {
    window.addEventListener('popstate', () => this.render())
    window.addEventListener('niqer-unauthorized', () => this.onUnauthorized())
    this.addEventListener('logged-in', () => {
      go('/designer/print')
      this.render()
    })
    this.addEventListener('logged-out', () => {
      go('/login')
      this.render()
    })
    this._expireTimer = window.setInterval(() => {
      if (getToken() && isSessionExpired()) this.onUnauthorized()
    }, 10000)
    this.render()
  }

  disconnectedCallback () {
    if (this._expireTimer) window.clearInterval(this._expireTimer)
  }

  applyLicense (status) {
    const tool = this.querySelector('niqer-print-tool')
    const preview = this.querySelector('niqer-report-preview')
    if (tool && typeof tool.setLicenseStatus === 'function') tool.setLicenseStatus(status)
    if (preview && typeof preview.setLicenseStatus === 'function') preview.setLicenseStatus(status)
  }

  async syncLicense (el) {
    try {
      const status = await http.get('/report/license')
      if (el && typeof el.setLicenseStatus === 'function') el.setLicenseStatus(status)
      else this.applyLicense(status)
    } catch {
      /* 未激活保持免费 */
    }
  }

  onUnauthorized () {
    clearSession()
    if (pathOf() === '/login') return
    window.history.replaceState({}, '', '/login')
    this.render()
  }

  render () {
    let path = pathOf()
    const ok = hasSession()
    if (path === '/') {
      path = ok ? '/designer/print' : '/login'
      window.history.replaceState({}, '', path)
    }
    if (path !== '/login' && !ok) {
      window.history.replaceState({}, '', '/login')
      path = '/login'
    }
    if (path === '/login' && ok) {
      window.history.replaceState({}, '', '/designer/print')
      path = '/designer/print'
    }
    this.replaceChildren()
    if (path === '/login') {
      this.appendChild(document.createElement('report-tool-login'))
      return
    }
    if (path === '/designer/preview' || path === '/designer/preview-embedded') {
      const preview = document.createElement('niqer-report-preview')
      preview.kind = path.includes('preview-embedded') ? 'html' : 'pdf'
      preview.getAuthHeaders = authHeaders
      this.appendChild(preview)
      this.syncLicense(preview)
      return
    }
    const tool = document.createElement('niqer-print-tool')
    tool.getAuthHeaders = authHeaders
    tool.isAdmin = () => !!getToken()
    tool.storagePlugin = createStoragePlugin()
    tool.datasourcePlugin = createDatasourcePlugin()
    this.appendChild(tool)
    this.appendChild(document.createElement('report-tool-account'))
    this.syncLicense(tool)
  }
}

customElements.define('report-tool-app', ReportToolApp)
