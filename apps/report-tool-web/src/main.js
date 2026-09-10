if (import.meta.env.DEV) {
  await import('@niqer/report')
}
import './style.css'
import './app.js'

const root = document.getElementById('app')
root.replaceChildren(document.createElement('report-tool-app'))
