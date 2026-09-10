import { clearSession, getUser } from './session.js'

function esc (s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

class ReportToolAccount extends HTMLElement {
  constructor () {
    super()
    this.menuOpen = false
  }

  connectedCallback () {
    this.render()
  }

  user () {
    return getUser() || {}
  }

  render () {
    const user = this.user()
    const username = user.username || 'admin'
    const displayName = user.displayName || username
    const initial = String(displayName).slice(0, 1).toUpperCase()
    this.innerHTML = `
      <button type="button" class="tool-avatar-chip${this.menuOpen ? ' open' : ''}" data-act="menu">${esc(initial)}</button>
      ${this.menuOpen ? `
        <div class="tool-person-card">
          <div class="tool-person-card__who">
            <div class="tool-person-card__name">${esc(displayName)}</div>
            <div class="tool-person-card__sub">${esc(username)}</div>
          </div>
          <button type="button" class="tool-person-card__item danger" data-act="logout">退出</button>
        </div>
        <div class="tool-person-mask" data-act="closemenu"></div>
      ` : ''}
    `
    this.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', (ev) => this.onAct(ev, el.dataset.act))
    })
  }

  onAct (ev, act) {
    ev.preventDefault()
    if (act === 'menu') { this.menuOpen = !this.menuOpen; this.render(); return }
    if (act === 'closemenu') { this.menuOpen = false; this.render(); return }
    if (act === 'logout') {
      clearSession()
      this.dispatchEvent(new CustomEvent('logged-out', { bubbles: true }))
    }
  }
}

customElements.define('report-tool-account', ReportToolAccount)
