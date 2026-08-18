// 禁止: schema?dbName、Excel、虚构后端代理
import { REPORT_DATASET_API_FETCH, REPORT_SQL_PARSE, REPORT_SQL_SCHEMA } from './api.js'
import { canManageDatasource, openDatasourceDialog } from './datasource-ui.js'
import { ht } from './i18n.js'
import { mountSqlEditor } from './sql-editor.js'
import { confirmDlg, formatReportSql, toast } from './util.js'

function nextVar (dataset) {
  let i = 1
  while (dataset['ds' + i] !== undefined) i++
  return 'ds' + i
}

function sortDatasetVarKeys (keys) {
  const dsNum = []
  const rest = []
  for (const k of keys) {
    const m = String(k).match(/^ds(\d+)$/i)
    if (m) dsNum.push({ k, n: Number(m[1]) })
    else rest.push(k)
  }
  dsNum.sort((a, b) => a.n - b.n)
  rest.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
  return dsNum.map((x) => x.k).concat(rest)
}

function extractPlaceholders (text) {
  const re = /#\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g
  const set = new Set()
  let m
  while ((m = re.exec(text || '')) !== null) set.add(m[1])
  return Array.from(set)
}

function replacePlaceholders (text, paramMap) {
  if (!text) return text
  let result = text
  paramMap.forEach((value, key) => {
    result = result.replace(new RegExp('#\\{\\s*' + key + '\\s*\\}', 'g'), value)
  })
  return result
}

function flattenObject (obj, prefix, maxDepth, currentDepth) {
  const fields = new Set()
  const md = maxDepth == null ? 10 : maxDepth
  const d = currentDepth || 0
  if (d >= md || obj == null) return Array.from(fields)
  if (Array.isArray(obj)) {
    const n = Math.min(obj.length, 5)
    for (let i = 0; i < n; i++) {
      const item = obj[i]
      if (item && typeof item === 'object') flattenObject(item, prefix || '', md, d + 1).forEach((f) => fields.add(f))
    }
    return Array.from(fields)
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const value = obj[key]
      const next = prefix ? prefix + '.' + key : key
      if (Array.isArray(value)) {
        const n = Math.min(value.length, 5)
        for (let i = 0; i < n; i++) {
          const item = value[i]
          if (item && typeof item === 'object') flattenObject(item, next, md, d + 1).forEach((f) => fields.add(f))
        }
      } else if (value && typeof value === 'object') {
        flattenObject(value, next, md, d + 1).forEach((f) => fields.add(f))
      } else {
        fields.add(next)
      }
    }
  }
  return Array.from(fields)
}

function buildFieldExpression (ds, varName, primaryField) {
  if (!varName || !primaryField || !ds) return ''
  const selected = Array.isArray(ds.selectedFields) && ds.selectedFields.includes(primaryField)
    ? ds.selectedFields
    : [primaryField]
  const fields = ds.fields || []
  const valid = selected.filter((f) => fields.includes(f))
  if (!valid.length) return ''
  return valid.map((f) => varName + '.' + f).join(',')
}

function buildClipboardText (ds, varName, primaryField) {
  const plain = buildFieldExpression(ds, varName, primaryField)
  if (!plain) return ''
  return plain.split(',').map((p) => '${' + p.trim() + '}').join(',')
}

async function copyText (text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
}

function esc (s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function parseHeaderPairs (text) {
  const raw = String(text || '').trim()
  if (!raw || raw === '{}') return { ok: true, pairs: [{ key: '', value: '' }] }
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, pairs: null }
    const keys = Object.keys(obj)
    if (!keys.length) return { ok: true, pairs: [{ key: '', value: '' }] }
    return { ok: true, pairs: keys.map((k) => ({ key: k, value: obj[k] == null ? '' : String(obj[k]) })) }
  } catch {
    return { ok: false, pairs: null }
  }
}

function stringifyHeaderPairs (pairs) {
  const obj = {}
  ;(pairs || []).forEach((p) => {
    const k = String(p.key || '').trim()
    if (!k) return
    obj[k] = p.value == null ? '' : String(p.value)
  })
  return Object.keys(obj).length ? JSON.stringify(obj) : ''
}

const ICON_PLUS = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>'
const ICON_DEL = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>'

export function mountDataset (host, pane, ctx) {
  const state = {
    schema: {},
    schemaLoaded: false,
    connections: [],
    connectionsLoaded: false,
    lastActive: '',
    editorOpen: false
  }

  function dataset () {
    return ctx.getDataset() || {}
  }

  function param () {
    return ctx.getParam() || {}
  }

  function paint () {
    const ds = dataset()
    const keys = sortDatasetVarKeys(Object.keys(ds))
    const admin = !ctx.isAdmin || ctx.isAdmin()
    const scroller = pane.querySelector('.data-panel')
    const keepY = scroller ? scroller.scrollTop : 0
    let html = '<div class="data-panel" tabindex="-1" data-ds-root>'
    html += '<div class="panel-content">'
    if (canManageDatasource(ctx.datasourcePlugin)) {
      html += '<div class="ds-plugin-bar"><button type="button" class="link-btn" data-act="conns">' + esc(ht(host, 'reportDesigner.dataset.manageConnections')) + '</button></div>'
    }
    if (admin) {
      html += '<div class="ds-item new-dataset-card" data-act="add"><div class="ds-item-header"><div class="ds-title"><span class="ds-name">' + esc(ht(host, 'reportDesigner.dataset.addDatasetCard')) + '</span><span class="ds-badges"><span class="badge">SQL/API</span></span></div><div class="ds-meta"><span class="chev">▸</span></div></div></div>'
    }
    if (keys.length) {
      html += '<div class="ds-list">'
      for (const name of keys) {
        const item = ds[name] || {}
        const open = item.expanded === true
        const sel = Array.isArray(item.selectedFields) ? item.selectedFields : []
        const fields = Array.isArray(item.fields) ? item.fields : []
        html += '<div class="ds-item" data-ds="' + esc(name) + '">'
        html += '<div class="ds-item-header" data-act="toggle"><div class="ds-title"><span class="ds-name">' + esc(item.name || name) + '</span><span class="ds-badges"><span class="badge">' + esc(item.type || '') + '</span><span class="badge muted">' + esc(name) + '</span></span></div><div class="ds-meta">'
        if (admin) html += '<button type="button" class="link-btn" data-act="edit">' + esc(ht(host, 'edit')) + '</button><button type="button" class="link-btn danger" data-act="del">' + esc(ht(host, 'remove')) + '</button>'
        html += '<span class="chev">' + (open ? '▾' : '▸') + '</span></div></div>'
        if (open) {
          html += '<div class="ds-body"><div class="fields">'
          html += '<div class="field-actions">'
          if (admin) {
            html += '<button type="button" class="action-btn plus-btn" data-act="addf" title="' + esc(ht(host, 'reportDesigner.dataset.addFieldTitle')) + '">' + ICON_PLUS + '</button>'
            html += '<button type="button" class="action-btn delete-btn" data-act="delf" title="' + esc(ht(host, 'reportDesigner.dataset.deleteSelectedFieldsTitle')) + '"' + (sel.length ? '' : ' disabled') + '>' + ICON_DEL + '</button>'
          }
          html += '</div>'
          if (fields.length) {
            html += '<div class="kv-list field-list">'
            fields.forEach((f, idx) => {
              html += '<div class="kv-row field-row' + (sel.includes(f) ? ' selected' : '') + '" data-f="' + esc(f) + '" data-i="' + idx + '" draggable="true"><div class="kv-cell kv-key" data-edit-field="1"><span class="kv-text">' + esc(f) + '</span></div></div>'
            })
            html += '</div>'
          } else html += '<div class="muted tiny-text">' + esc(ht(host, 'reportDesigner.dataset.noFields')) + '</div>'
          html += '</div></div>'
        }
        html += '</div>'
      }
      html += '</div>'
    } else {
      html += '<div class="no-data"><p>' + esc(ht(host, 'reportDesigner.dataset.noDataset')) + '</p></div>'
    }
    html += '</div></div>'
    pane.innerHTML = html
    const next = pane.querySelector('.data-panel')
    if (next && keepY) next.scrollTop = keepY
  }

  function applyFieldSelection (name, selected) {
    const card = pane.querySelector('[data-ds="' + name.replace(/"/g, '') + '"]')
    if (!card) return
    card.querySelectorAll('.field-row').forEach((row) => {
      row.classList.toggle('selected', selected.includes(row.dataset.f))
    })
    const del = card.querySelector('[data-act=delf]')
    if (del) del.disabled = !selected.length
  }

  function focusPanel () {
    const root = pane.querySelector('[data-ds-root]')
    if (root && root.focus) {
      try { root.focus({ preventScroll: true }) } catch { root.focus() }
    }
  }

  async function loadSchema () {
    if (state.schemaLoaded) return state.schema
    try {
      const data = await ctx.http.get(REPORT_SQL_SCHEMA)
      state.schema = data && typeof data === 'object' ? data : {}
    } catch {
      state.schema = {}
    }
    state.schemaLoaded = true
    return state.schema
  }

  async function loadConnections () {
    if (state.connectionsLoaded) return state.connections
    const plugin = ctx.datasourcePlugin
    if (!plugin || typeof plugin.list !== 'function') {
      state.connections = []
      state.connectionsLoaded = true
      return state.connections
    }
    try {
      const data = await plugin.list()
      state.connections = Array.isArray(data) ? data : []
    } catch {
      state.connections = []
    }
    state.connectionsLoaded = true
    return state.connections
  }

  function detectedNames (draft) {
    const sources = draft.type === 'SQL'
      ? [draft.content]
      : [draft.url, draft.headers, draft.body]
    const set = new Set()
    sources.forEach((s) => extractPlaceholders(s).forEach((n) => set.add(n)))
    return Array.from(set)
  }

  function paintPending (mask, draft, pending) {
    const box = mask.querySelector('[data-pending]')
    if (!box) return
    const names = detectedNames(draft)
    const existing = new Map(pending.map((p) => [p.key, p.value]))
    const valueMap = new Map(Object.entries(param()))
    pending.length = 0
    names.forEach((k) => {
      pending.push({ key: k, value: existing.has(k) ? existing.get(k) : (valueMap.get(k) ?? '') })
    })
    if (!pending.length) {
      box.innerHTML = ''
      const footer = mask.querySelector('[data-footer]')
      const err = mask.querySelector('[data-err]')
      if (footer && !(err && err.textContent)) footer.hidden = true
      return
    }
    const footer = mask.querySelector('[data-footer]')
    if (footer) footer.hidden = false
    box.innerHTML = '<div class="param-import"><div class="param-import-title">' + esc(ht(host, 'reportDesigner.dataset.detectedParams')) + '</div>' +
      pending.map((p, i) => '<div class="param-import-row"><span class="mono">' + esc(p.key) + '</span><input data-pend="' + i + '" value="' + esc(p.value) + '" placeholder="' + esc(ht(host, 'reportDesigner.dataset.exampleValueOptional')) + '"></div>').join('') +
      '</div>'
    box.querySelectorAll('[data-pend]').forEach((el) => {
      el.addEventListener('input', () => {
        const i = Number(el.dataset.pend)
        if (pending[i]) pending[i].value = el.value
      })
    })
  }

  async function fetchApiField (apiConfig, draftParam) {
    try {
    const paramMap = new Map(Object.entries(draftParam || {}))
    const processedUrl = replacePlaceholders(apiConfig.url, paramMap)
    const processedHeaders = apiConfig.headers ? replacePlaceholders(apiConfig.headers, paramMap) : '{}'
    JSON.parse(processedHeaders)
    const processedBody = apiConfig.body ? replacePlaceholders(apiConfig.body, paramMap) : null
    if (processedBody) JSON.parse(processedBody)
    const method = apiConfig.method || 'GET'
    let response = await ctx.http.post(REPORT_DATASET_API_FETCH, {
      url: processedUrl,
      method,
      headers: processedHeaders,
      body: processedBody
    })
    if (response && typeof response === 'object' && !Array.isArray(response) && response.status === false) {
      const msg = response.message != null && String(response.message).trim() !== ''
        ? String(response.message)
        : ht(host, 'reportDesigner.dataset.requestFailedGeneric')
      toast(host, msg)
      return null
    }
    if (Array.isArray(response) && response.length > 0) return flattenObject(response[0])
    if (response && typeof response === 'object') return flattenObject(response)
    return []
    } catch (error) {
      toast(host, ht(host, 'reportDesigner.dataset.parseApiFieldFailedPrefix') + ((error && error.message) || error))
      return null
    }
  }

  function openEditor (orig) {
    state.editorOpen = true
    const ds = dataset()
    const cur = orig ? Object.assign({}, ds[orig]) : { type: 'SQL', method: 'GET', headers: '', body: '', content: '', url: '', dbName: '', name: '' }
    const mask = host.ownerDocument.createElement('div')
    mask.className = 'el-overlay npt-mask'
    const root = host.shadowRoot || host
    const isApi = cur.type === 'API'
    const dbField = '<input data-f="dbName" value="' + esc(cur.dbName || '') + '" placeholder="' + esc(ht(host, 'reportDesigner.dataset.dbNamePlaceholder')) + '">'
    mask.innerHTML =
      '<div class="dataset-panel-dataset-dialog l_dialog_lg ' + (isApi ? 'is-api' : 'is-sql') + '">' +
      '<div class="el-dialog">' +
      '<div class="el-dialog__header"><span class="el-dialog__title">' + esc(ht(host, 'reportDesigner.dataset.datasetDialogTitle')) + '</span></div>' +
      '<div class="el-dialog__body"><div class="modal-body">' +
      '<div class="meta-grid">' +
      '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.varName')) + '</label><input data-f="varName" value="' + esc(orig || '') + '" placeholder="' + esc(ht(host, 'reportDesigner.dataset.varNamePlaceholder')) + '"></div>' +
      '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.name')) + '</label><input data-f="name" value="' + esc(cur.name || '') + '" placeholder="' + esc(ht(host, 'reportDesigner.dataset.datasetNamePlaceholder')) + '"></div>' +
      '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.type')) + '</label>' +
      '<select data-f="type"><option value="SQL"' + (isApi ? '' : ' selected') + '>SQL</option><option value="API"' + (isApi ? ' selected' : '') + '>API</option></select></div>' +
      '<div class="form-row" data-sql-meta' + (isApi ? ' hidden' : '') + '><label>' + esc(ht(host, 'reportDesigner.dataset.dbName')) + '</label>' + dbField + '</div>' +
      '</div>' +
      '<div class="content-zone">' +
      '<div class="editor-block" data-sql' + (isApi ? ' hidden' : '') + '><label class="label-with-action"><span>' + esc(ht(host, 'reportDesigner.dataset.content')) + '</span><button type="button" class="link-btn" data-act="fmt">' + esc(ht(host, 'reportDesigner.dataset.format')) + '</button></label><div data-sql-host></div></div>' +
      '<div class="api-block" data-api' + (isApi ? '' : ' hidden') + '>' +
      '<div class="api-request-line">' +
      '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.httpMethod')) + '</label>' +
      '<select data-f="method"><option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option><option value="DELETE">DELETE</option></select></div>' +
      '<div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.requestUrl')) + '</label><input data-f="url" value="' + esc(cur.url || (isApi ? cur.content : '') || '') + '" placeholder="' + esc(ht(host, 'reportDesigner.dataset.requestUrlPlaceholder')) + '"></div>' +
      '</div>' +
      '<div class="form-row api-headers-row">' +
      '<label class="label-with-action"><span>' + esc(ht(host, 'reportDesigner.dataset.requestHeaders')) + '</span>' +
      '<span class="header-mode">' +
      '<button type="button" class="link-btn" data-hmode="kv">' + esc(ht(host, 'reportDesigner.dataset.headersModeKv')) + '</button>' +
      '<button type="button" class="link-btn" data-hmode="json">' + esc(ht(host, 'reportDesigner.dataset.headersModeJson')) + '</button>' +
      '</span></label>' +
      '<div data-headers-kv><div data-hk-list></div>' +
      '<button type="button" class="link-btn" data-hk-add>' + esc(ht(host, 'reportDesigner.dataset.headersAddRow')) + '</button></div>' +
      '<textarea data-f="headers" hidden placeholder="' + esc(ht(host, 'reportDesigner.dataset.requestHeadersPlaceholder')) + '">' + esc(cur.headers || '') + '</textarea>' +
      '</div>' +
      '<div class="form-row" data-body-row' + ((cur.method === 'POST' || cur.method === 'PUT') ? '' : ' hidden') + '><label>' + esc(ht(host, 'reportDesigner.dataset.requestBody')) + '</label><textarea data-f="body" placeholder="' + esc(ht(host, 'reportDesigner.dataset.requestBodyPlaceholder')) + '">' + esc(cur.body || '') + '</textarea></div>' +
      '</div></div>' +
      '<div class="footer-zone" data-footer hidden><p class="error-text" data-err></p><div data-pending></div></div>' +
      '</div></div>' +
      '<div class="el-dialog__footer">' +
      '<button type="button" class="el-button el-button--default" data-k="n">' + esc(ht(host, 'cancel')) + '</button>' +
      '<button type="button" class="el-button el-button--primary" data-k="y">' + esc(ht(host, 'save')) + '</button>' +
      '</div></div></div>'
    root.appendChild(mask)
    const typeEl = mask.querySelector('[data-f=type]')
    const methodEl = mask.querySelector('[data-f=method]')
    methodEl.value = cur.method || 'GET'
    const sqlHost = mask.querySelector('[data-sql-host]')
    const sqlEditor = mountSqlEditor(sqlHost, {
      value: cur.content || '',
      schema: state.schema,
      paramNames: Object.keys(param()),
      datasetVars: Object.entries(ds).map(([varName, spec]) => ({ varName, fields: (spec && spec.fields) || [] })),
      height: '48vh',
      minHeight: '300px',
      onChange () { syncDraft() }
    })
    let closed = false
    const pending = []
    const draft = {
      type: typeEl.value,
      content: sqlEditor.getValue(),
      url: cur.url || '',
      headers: cur.headers || '',
      body: cur.body || ''
    }

    function showType () {
      const t = typeEl.value
      draft.type = t
      const dlg = mask.querySelector('.dataset-panel-dataset-dialog')
      if (dlg) {
        dlg.classList.toggle('is-api', t === 'API')
        dlg.classList.toggle('is-sql', t === 'SQL')
      }
      mask.querySelector('[data-sql]').hidden = t !== 'SQL'
      mask.querySelector('[data-sql-meta]').hidden = t !== 'SQL'
      mask.querySelector('[data-api]').hidden = t !== 'API'
      showBody()
      paintPending(mask, draft, pending)
    }

    function showBody () {
      const method = methodEl.value || 'GET'
      const row = mask.querySelector('[data-body-row]')
      row.hidden = !(method === 'POST' || method === 'PUT')
    }

    function syncDraft () {
      draft.type = typeEl.value
      draft.content = sqlEditor.getValue()
      draft.url = mask.querySelector('[data-f=url]').value
      draft.headers = headerText()
      draft.body = mask.querySelector('[data-f=body]').value
      paintPending(mask, draft, pending)
    }

    let headerMode = 'kv'
    const headerTa = mask.querySelector('[data-f=headers]')

    function headerText () {
      if (headerMode === 'kv') flushHeadersFromKv()
      return headerTa ? headerTa.value : ''
    }

    function readHeaderPairs () {
      return Array.from(mask.querySelectorAll('.header-kv-row')).map((row) => ({
        key: (row.querySelector('[data-hk-key]') || {}).value || '',
        value: (row.querySelector('[data-hk-val]') || {}).value || ''
      }))
    }

    function flushHeadersFromKv () {
      if (headerTa) headerTa.value = stringifyHeaderPairs(readHeaderPairs())
    }

    function paintHeaderKv (pairs) {
      const list = mask.querySelector('[data-hk-list]')
      if (!list) return
      const rows = pairs && pairs.length ? pairs : [{ key: '', value: '' }]
      list.innerHTML = rows.map((p, i) =>
        '<div class="header-kv-row" data-hk="' + i + '">' +
        '<input data-hk-key value="' + esc(p.key) + '" placeholder="' + esc(ht(host, 'reportDesigner.dataset.headersKeyPlaceholder')) + '">' +
        '<input data-hk-val value="' + esc(p.value) + '" placeholder="' + esc(ht(host, 'reportDesigner.dataset.headersValuePlaceholder')) + '">' +
        '<button type="button" class="action-btn delete-btn" data-hk-del title="' + esc(ht(host, 'remove')) + '">' + ICON_DEL + '</button>' +
        '</div>'
      ).join('')
      list.querySelectorAll('input').forEach((el) => {
        el.addEventListener('input', () => {
          flushHeadersFromKv()
          syncDraft()
        })
      })
      list.querySelectorAll('[data-hk-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = readHeaderPairs()
          const i = Number(btn.closest('[data-hk]').dataset.hk)
          next.splice(i, 1)
          if (!next.length) next.push({ key: '', value: '' })
          paintHeaderKv(next)
          flushHeadersFromKv()
          syncDraft()
        })
      })
    }

    function setHeaderMode (mode) {
      const kvBox = mask.querySelector('[data-headers-kv]')
      if (mode === 'kv') {
        const parsed = parseHeaderPairs(headerTa ? headerTa.value : '')
        if (!parsed.ok) {
          showErr(ht(host, 'reportDesigner.dataset.headersJsonInvalid'))
          mode = 'json'
        } else {
          paintHeaderKv(parsed.pairs)
        }
      } else if (headerMode === 'kv') {
        flushHeadersFromKv()
      }
      headerMode = mode
      if (kvBox) kvBox.hidden = mode !== 'kv'
      if (headerTa) headerTa.hidden = mode !== 'json'
      mask.querySelectorAll('[data-hmode]').forEach((btn) => {
        btn.classList.toggle('is-on', btn.dataset.hmode === mode)
      })
    }

    showType()
    typeEl.addEventListener('change', showType)
    methodEl.addEventListener('change', () => { showBody(); syncDraft() })
    mask.querySelector('[data-act=fmt]').addEventListener('click', () => {
      sqlEditor.setValue(formatReportSql(sqlEditor.getValue()))
      syncDraft()
    })
    ;['url', 'headers', 'body'].forEach((key) => {
      mask.querySelector('[data-f=' + key + ']').addEventListener('input', syncDraft)
    })
    mask.querySelectorAll('[data-hmode]').forEach((btn) => {
      btn.addEventListener('click', () => setHeaderMode(btn.dataset.hmode))
    })
    mask.querySelector('[data-hk-add]').addEventListener('click', () => {
      const next = readHeaderPairs()
      next.push({ key: '', value: '' })
      paintHeaderKv(next)
      flushHeadersFromKv()
      syncDraft()
    })
    setHeaderMode(parseHeaderPairs(cur.headers || '').ok ? 'kv' : 'json')
    paintPending(mask, draft, pending)

    function val (key) {
      const el = mask.querySelector('[data-f=' + key + ']')
      return el ? el.value : ''
    }

    function showErr (msg) {
      const err = mask.querySelector('[data-err]')
      const footer = mask.querySelector('[data-footer]')
      if (err) err.textContent = msg || ''
      if (footer) footer.hidden = !msg && !pending.length
    }

    async function save () {
      const type = typeEl.value
      const name = val('name').trim() || ht(host, 'reportDesigner.dataset.unnamed')
      let varName = val('varName').trim()
      if (!varName) varName = orig || nextVar(ds)
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(varName)) {
        showErr(ht(host, 'reportDesigner.dataset.invalidVarName'))
        return
      }
      if (ds[varName] && varName !== orig) {
        showErr(ht(host, 'reportDesigner.dataset.varNameExists'))
        return
      }
      const nextParam = Object.assign({}, param())
      pending.forEach((p) => {
        const k = String(p.key || '').trim()
        if (k) nextParam[k] = p.value || ''
      })
      ctx.setParam(nextParam)
      let fields = []
      let paramNames = []
      let extra = {}
      let emptyHint = ''
      if (type === 'SQL') {
        const content = sqlEditor.getValue().trim()
        if (!content) {
          showErr(ht(host, 'reportDesigner.dataset.contentRequired'))
          return
        }
        const parsed = await ctx.http.post(REPORT_SQL_PARSE, Object.assign({
          sql: content,
          dbName: val('dbName').trim()
        }, nextParam))
        fields = Array.isArray(parsed) ? parsed : []
        paramNames = extractPlaceholders(content)
        extra = { content, dbName: val('dbName').trim(), url: '', method: '', headers: '', body: '' }
      } else {
        const url = val('url').trim()
        if (!url) {
          showErr(ht(host, 'reportDesigner.dataset.urlRequired'))
          return
        }
        const method = val('method') || 'GET'
        const headers = headerText()
        const body = (method === 'POST' || method === 'PUT') ? val('body') : ''
        fields = await fetchApiField({ url, method, headers, body }, nextParam)
        if (fields == null) return
        const prevFields = orig && ds[orig] && Array.isArray(ds[orig].fields) ? ds[orig].fields.slice() : []
        if (!fields.length && prevFields.length) {
          fields = prevFields
          emptyHint = 'keep'
        } else if (!fields.length) {
          emptyHint = 'empty'
        }
        paramNames = Array.from(new Set([
          ...extractPlaceholders(url),
          ...extractPlaceholders(headers),
          ...extractPlaceholders(body)
        ]))
        extra = { url, method, headers, body, content: '', dbName: '' }
      }
      const next = Object.assign({}, ds)
      if (orig && orig !== varName) delete next[orig]
      next[varName] = Object.assign({
        name,
        type,
        paramNames,
        fields,
        expanded: true,
        selectedFields: [],
        fieldAnchorIndex: -1,
        data: []
      }, extra)
      ctx.setDataset(next)
      closeEditor()
      paint()
      if (emptyHint === 'keep') toast(host, ht(host, 'reportDesigner.dataset.parseApiEmptyKeepFields'), 'ok')
      else if (emptyHint === 'empty') toast(host, ht(host, 'reportDesigner.dataset.parseApiEmpty'), 'err')
      else toast(host, ht(host, 'reportDesigner.dataset.parseFieldSuccess'), 'ok')
    }

    function closeEditor () {
      if (closed) return
      closed = true
      sqlEditor.destroy()
      state.editorOpen = false
      mask.remove()
    }

    function fillDbSelect (connections) {
      const box = mask.querySelector('[data-sql-meta]')
      if (!box || !connections.length) return
      const curVal = val('dbName')
      const opts = connections.map((c) => '<option value="' + esc(c.id) + '"' + (curVal === c.id ? ' selected' : '') + '>' + esc(c.name || c.id) + '</option>').join('')
      box.innerHTML = '<label>' + esc(ht(host, 'reportDesigner.dataset.dbName')) + '</label>' +
        '<select data-f="dbName"><option value="">' + esc(ht(host, 'reportDesigner.dataset.dbNamePlaceholder')) + '</option>' + opts + '</select>'
    }

    void loadSchema().then((schema) => {
      if (!closed) sqlEditor.setSchema(schema)
    })
    void loadConnections().then((connections) => {
      if (!closed) fillDbSelect(connections)
    })

    const saveBtn = mask.querySelector('[data-k=y]')
    mask.addEventListener('click', async (ev) => {
      if (ev.target === mask || ev.target.closest('[data-k=n]')) {
        closeEditor()
        return
      }
      if (!ev.target.closest('[data-k=y]')) return
      if (saveBtn && saveBtn.disabled) return
      if (saveBtn) saveBtn.disabled = true
      try {
        await save()
      } catch (err) {
        showErr((err && err.message) || String(err))
      } finally {
        if (saveBtn && mask.isConnected) saveBtn.disabled = false
      }
    })
    mask.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        closeEditor()
      }
    })
  }

  function openFieldForm (value) {
    return new Promise((resolve) => {
      const root = host.shadowRoot || host
      const mask = host.ownerDocument.createElement('div')
      mask.className = 'el-overlay npt-mask'
      state.editorOpen = true
      mask.innerHTML =
        '<div class="l_dialog_sm"><div class="el-dialog">' +
        '<div class="el-dialog__header"><span class="el-dialog__title">' + esc(ht(host, 'reportDesigner.dataset.fieldNameDialogTitle')) + '</span></div>' +
        '<div class="el-dialog__body"><div class="modal-body"><div class="form-row"><label>' + esc(ht(host, 'reportDesigner.dataset.fieldNameLabel')) + '</label>' +
        '<input data-f="name" value="' + esc(value || '') + '" placeholder="' + esc(ht(host, 'reportDesigner.dataset.fieldNamePlaceholder')) + '"></div></div></div>' +
        '<div class="el-dialog__footer">' +
        '<button type="button" class="el-button el-button--default" data-k="n">' + esc(ht(host, 'cancel')) + '</button>' +
        '<button type="button" class="el-button el-button--primary" data-k="y">' + esc(ht(host, 'save')) + '</button>' +
        '</div></div></div>'
      const close = (ok) => {
        state.editorOpen = false
        if (!ok) {
          mask.remove()
          resolve(null)
          return
        }
        const el = mask.querySelector('[data-f=name]')
        mask.remove()
        resolve(el ? el.value : '')
      }
      mask.addEventListener('click', (ev) => {
        if (ev.target === mask || ev.target.closest('[data-k=n]')) close(false)
        if (ev.target.closest('[data-k=y]')) close(true)
      })
      mask.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') close(true)
        if (ev.key === 'Escape') close(false)
      })
      root.appendChild(mask)
      const first = mask.querySelector('input')
      if (first) first.focus()
    })
  }

  pane.addEventListener('click', async (ev) => {
    const actBtn = ev.target.closest('[data-act]')
    const act = actBtn && pane.contains(actBtn) ? actBtn.dataset.act : ''
    if (act === 'conns') {
      const changed = await openDatasourceDialog(host, ctx.datasourcePlugin)
      if (changed) state.connectionsLoaded = false
      return
    }
    if (act === 'add' || ev.target.closest('.new-dataset-card')) {
      openEditor('')
      return
    }
    const card = ev.target.closest('[data-ds]')
    if (!card) return
    const name = card.dataset.ds
    if (act === 'edit') {
      openEditor(name)
      return
    }
    if (act === 'del') {
      const ok = await confirmDlg(host, ht(host, 'reportDesigner.dataset.confirmDeleteDataset', { name }))
      if (!ok) return
      const next = Object.assign({}, dataset())
      delete next[name]
      ctx.setDataset(next)
      paint()
      return
    }
    if (act === 'addf') {
      const raw = await openFieldForm('')
      if (raw == null) return
      const f = String(raw).trim()
      if (!f) {
        toast(host, ht(host, 'reportDesigner.dataset.fieldNameRequired'), 'err')
        return
      }
      const next = Object.assign({}, dataset())
      const item = Object.assign({}, next[name])
      item.fields = Array.isArray(item.fields) ? item.fields.slice() : []
      if (item.fields.includes(f)) {
        toast(host, ht(host, 'reportDesigner.dataset.fieldExists', { name: f }), 'err')
        return
      }
      item.fields.push(f)
      next[name] = item
      ctx.setDataset(next)
      paint()
      return
    }
    if (act === 'delf') {
      const item0 = dataset()[name] || {}
      const sel = Array.isArray(item0.selectedFields) ? item0.selectedFields : []
      if (!sel.length) return
      const ok = await confirmDlg(host, ht(host, 'reportDesigner.dataset.confirmDeleteFields', { count: sel.length }))
      if (!ok) return
      const next = Object.assign({}, dataset())
      const item = Object.assign({}, next[name])
      item.fields = (item.fields || []).filter((f) => !sel.includes(f))
      item.selectedFields = []
      next[name] = item
      ctx.setDataset(next)
      paint()
      return
    }
    const field = ev.target.closest('.field-row[data-f]')
    if (field && card.contains(field)) {
      const f = field.dataset.f
      const idx = Number(field.dataset.i)
      const next = Object.assign({}, dataset())
      const item = Object.assign({}, next[name])
      const fields = Array.isArray(item.fields) ? item.fields : []
      if (!Array.isArray(item.selectedFields)) item.selectedFields = []
      if (typeof item.fieldAnchorIndex !== 'number') item.fieldAnchorIndex = -1
      state.lastActive = name
      if (ev.shiftKey && item.fieldAnchorIndex !== -1) {
        const start = Math.min(item.fieldAnchorIndex, idx)
        const end = Math.max(item.fieldAnchorIndex, idx)
        const set = new Set(item.selectedFields)
        fields.slice(start, end + 1).forEach((k) => set.add(k))
        item.selectedFields = Array.from(set)
      } else if (ev.ctrlKey || ev.metaKey) {
        item.selectedFields = item.selectedFields.includes(f)
          ? item.selectedFields.filter((x) => x !== f)
          : item.selectedFields.concat(f)
        item.fieldAnchorIndex = idx
      } else {
        item.selectedFields = [f]
        item.fieldAnchorIndex = idx
      }
      next[name] = item
      ctx.setDataset(next, true)
      applyFieldSelection(name, item.selectedFields)
      focusPanel()
      return
    }
    if (act === 'toggle' || ev.target.closest('[data-act=toggle]')) {
      const next = Object.assign({}, dataset())
      const item = Object.assign({}, next[name] || {})
      item.expanded = !item.expanded
      next[name] = item
      ctx.setDataset(next, true)
      paint()
    }
  })

  pane.addEventListener('dblclick', async (ev) => {
    if (!ev.target.closest('[data-edit-field]')) return
    const field = ev.target.closest('.field-row[data-f]')
    const card = ev.target.closest('[data-ds]')
    if (!field || !card) return
    ev.stopPropagation()
    const name = card.dataset.ds
    const raw = await openFieldForm(field.dataset.f)
    if (raw == null) return
    const nextName = String(raw).trim()
    if (!nextName) {
      toast(host, ht(host, 'reportDesigner.dataset.fieldNameRequired'), 'err')
      return
    }
    if (nextName === field.dataset.f) return
    const next = Object.assign({}, dataset())
    const item = Object.assign({}, next[name])
    item.fields = Array.isArray(item.fields) ? item.fields.slice() : []
    if (item.fields.includes(nextName)) {
      toast(host, ht(host, 'reportDesigner.dataset.fieldExists', { name: nextName }), 'err')
      return
    }
    const index = item.fields.indexOf(field.dataset.f)
    if (index !== -1) item.fields[index] = nextName
    next[name] = item
    ctx.setDataset(next)
    paint()
  })

  pane.addEventListener('dragstart', (ev) => {
    const field = ev.target.closest('.field-row[data-f]')
    const card = ev.target.closest('[data-ds]')
    if (!field || !card || !ev.dataTransfer) return
    const name = card.dataset.ds
    const ds = dataset()[name] || {}
    state.lastActive = name
    const text = buildFieldExpression(ds, name, field.dataset.f) || (name + '.' + field.dataset.f)
    ev.dataTransfer.effectAllowed = 'copy'
    ev.dataTransfer.setData('text/plain', text)
    ev.dataTransfer.setData('tk-dnd-field', '1')
  })

  function isTypingTarget (target) {
    if (!target || typeof target.tagName !== 'string') return false
    const tag = target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
    return !!target.isContentEditable
  }

  async function tryCopySelected (ev) {
    const isCopy = (ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && (ev.key === 'c' || ev.key === 'C')
    if (!isCopy) return false
    if (state.editorOpen) return false
    if (isTypingTarget(ev.target)) return false
    const vn = state.lastActive
    const ds = dataset()[vn]
    if (!ds || !Array.isArray(ds.selectedFields) || !ds.selectedFields.length) return false
    const text = buildClipboardText(ds, vn, ds.selectedFields[0])
    if (!text) return false
    ev.preventDefault()
    ev.stopPropagation()
    try {
      await copyText(text)
      toast(host, ht(host, 'reportDesigner.dataset.copiedExpression'), 'ok')
    } catch {
      toast(host, ht(host, 'reportDesigner.dataset.copyFailed'), 'err')
    }
    return true
  }

  pane.addEventListener('keydown', (ev) => { void tryCopySelected(ev) })
  const doc = host.ownerDocument
  const onCopyCapture = (ev) => {
    const root = pane.querySelector('[data-ds-root]') || pane
    if (!root.contains(ev.target)) return
    void tryCopySelected(ev)
  }
  doc.addEventListener('keydown', onCopyCapture, true)

  paint()
  return { paint }
}
