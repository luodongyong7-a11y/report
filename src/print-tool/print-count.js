import { ht } from './i18n.js'

function esc (s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

export function mountPrintCount (host, pane, ctx) {
  const state = { tables: [], loading: false }

  function current () {
    const tpl = ctx.getTemplate() || {}
    const pc = tpl.printCount && typeof tpl.printCount === 'object' ? tpl.printCount : {}
    return {
      enabled: !!(pc.table && String(pc.table).trim()),
      table: String(pc.table || '').trim(),
      whereSql: String(pc.whereSql || '')
    }
  }

  function write (next) {
    const tpl = Object.assign({}, ctx.getTemplate() || {})
    if (!next.enabled || !String(next.table || '').trim()) {
      delete tpl.printCount
    } else {
      const row = { table: String(next.table).trim() }
      const w = String(next.whereSql || '').trim()
      if (w) row.whereSql = w
      tpl.printCount = row
    }
    ctx.setTemplate(tpl)
  }

  function paint () {
    const cur = current()
    const admin = !ctx.isAdmin || ctx.isAdmin()
    let html = '<div class="print-count-panel">'
    html += '<p class="print-count-hint">' + esc(ht(host, 'designer.printCount.hint')) + '</p>'
    html += '<div class="print-count-row"><span class="print-count-label">' + esc(ht(host, 'designer.printCount.enable')) + '</span>'
    html += '<label class="print-count-switch"><input type="checkbox" data-pc="enable"' + (cur.enabled ? ' checked' : '') + (admin ? '' : ' disabled') + '> '
    html += esc(cur.enabled ? ht(host, 'designer.printCount.yes') : ht(host, 'designer.printCount.no')) + '</label></div>'
    if (cur.enabled) {
      html += '<div class="print-count-row"><span class="print-count-label">' + esc(ht(host, 'designer.printCount.table')) + '</span>'
      html += '<select class="print-count-select" data-pc="table"' + (admin ? '' : ' disabled') + '>'
      html += '<option value="">' + esc(ht(host, 'designer.printCount.tablePlaceholder')) + '</option>'
      const seen = new Set()
      for (const opt of state.tables) {
        const val = typeof opt === 'string' ? opt : (opt.table || opt.name || '')
        const lab = typeof opt === 'string' ? opt : (opt.label || opt.table || opt.name || val)
        if (!val || seen.has(val)) continue
        seen.add(val)
        html += '<option value="' + esc(val) + '"' + (cur.table === val ? ' selected' : '') + '>' + esc(lab) + '</option>'
      }
      if (cur.table && !seen.has(cur.table)) {
        html += '<option value="' + esc(cur.table) + '" selected>' + esc(cur.table) + '</option>'
      }
      html += '</select></div>'
      html += '<div class="print-count-row print-count-row--where"><span class="print-count-label">' + esc(ht(host, 'designer.printCount.condition')) + '</span>'
      html += '<textarea class="print-count-textarea" data-pc="where" placeholder="' + esc(ht(host, 'designer.printCount.wherePlaceholder')) + '"' + (admin ? '' : ' disabled') + '>' + String(cur.whereSql || '').replace(/</g, '&lt;') + '</textarea></div>'
    }
    html += '</div>'
    pane.innerHTML = html
  }

  async function loadTables () {
    if (!ctx.hostPrintCount || typeof ctx.hostPrintCount.fetchTables !== 'function') return
    state.loading = true
    try {
      const rows = await ctx.hostPrintCount.fetchTables()
      state.tables = Array.isArray(rows) ? rows : []
    } catch {
      state.tables = []
    } finally {
      state.loading = false
      paint()
    }
  }

  pane.addEventListener('change', (ev) => {
    const key = ev.target.dataset.pc
    if (!key) return
    const cur = current()
    if (key === 'enable') {
      cur.enabled = ev.target.checked
      if (!cur.enabled) {
        cur.table = ''
        cur.whereSql = ''
      }
      write(cur)
      paint()
      return
    }
    if (key === 'table') {
      cur.enabled = true
      cur.table = ev.target.value
      cur.whereSql = ''
      write(cur)
      paint()
    }
  })

  pane.addEventListener('input', (ev) => {
    if (ev.target.dataset.pc !== 'where') return
    const cur = current()
    cur.enabled = true
    cur.whereSql = ev.target.value
    write(cur)
  })

  loadTables()
  paint()
  return {
    paint,
    reload () { return loadTables() }
  }
}
