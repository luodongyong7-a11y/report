import http from './http.js'
import { setSession } from './session.js'

class ReportToolLogin extends HTMLElement {
  connectedCallback () {
    this.innerHTML = `
      <div class="login-page">
        <form class="login-card">
          <h1>报表工具</h1>
          <div class="form-row">
            <label>账号</label>
            <input name="username" autocomplete="username" value="admin" />
          </div>
          <div class="form-row">
            <label>密码</label>
            <input name="password" type="password" autocomplete="current-password" />
          </div>
          <p class="error-text" data-err hidden></p>
          <button type="submit" class="login-btn">登录</button>
        </form>
      </div>`
    this.querySelector('form').addEventListener('submit', (ev) => {
      ev.preventDefault()
      this.submit()
    })
  }

  async submit () {
    const err = this.querySelector('[data-err]')
    const btn = this.querySelector('.login-btn')
    const username = this.querySelector('[name=username]').value
    const password = this.querySelector('[name=password]').value
    err.hidden = true
    btn.disabled = true
    btn.textContent = '登录中…'
    try {
      const data = await http.post('/auth/login', { username, password })
      setSession(data.token, data.user)
      this.dispatchEvent(new CustomEvent('logged-in', { bubbles: true }))
    } catch (e) {
      err.textContent = e.message || '登录失败'
      err.hidden = false
    } finally {
      btn.disabled = false
      btn.textContent = '登录'
    }
  }
}

customElements.define('report-tool-login', ReportToolLogin)
