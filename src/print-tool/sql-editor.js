import { EditorView, basicSetup } from 'codemirror'
import { Compartment } from '@codemirror/state'
import { sql, PostgreSQL } from '@codemirror/lang-sql'

export function mountSqlEditor (parent, opts) {
  const langConf = new Compartment()
  const height = opts.height || '320px'
  const minHeight = opts.minHeight || '220px'
  let schema = opts.schema || {}
  let paramNames = opts.paramNames || []
  let datasetVars = opts.datasetVars || []
  let onChange = typeof opts.onChange === 'function' ? opts.onChange : null

  const placeholderSource = (context) => {
    const word = context.matchBefore(/[#$]\{[\w.]*/)
    if (!word || (word.from === word.to && !context.explicit)) return null
    const head = word.text.slice(0, 2)
    let options = []
    if (head === '#{') {
      options = (paramNames || []).map((p) => ({ label: '#{' + p + '}', type: 'variable', detail: 'param' }))
    } else if (head === '${') {
      options = (datasetVars || []).flatMap((dv) =>
        (dv.fields || []).map((f) => ({ label: '${' + dv.varName + '.' + f + '}', type: 'property', detail: dv.varName })))
    }
    if (!options.length) return null
    return { from: word.from, options }
  }

  function languageExt () {
    const lang = sql({ dialect: PostgreSQL, schema: schema || {}, upperCaseKeywords: false })
    return [lang, lang.language.data.of({ autocomplete: placeholderSource })]
  }

  const theme = EditorView.theme({
    '&': { height, minHeight, fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '8px' },
    '&.cm-focused': { outline: 'none', borderColor: '#2563eb', boxShadow: '0 0 0 3px rgba(37,99,235,0.1)' },
    '.cm-scroller': { fontFamily: "'Courier New', Courier, monospace", overflow: 'auto' },
    '.cm-content': { padding: '8px 0' }
  })

  const view = new EditorView({
    doc: opts.value || '',
    parent,
    extensions: [
      basicSetup,
      langConf.of(languageExt()),
      EditorView.lineWrapping,
      theme,
      EditorView.updateListener.of((u) => {
        if (u.docChanged && onChange) onChange(u.state.doc.toString())
      })
    ]
  })

  return {
    getValue () { return view.state.doc.toString() },
    setValue (text) {
      const next = String(text || '')
      if (next === view.state.doc.toString()) return
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
    },
    setSchema (next) {
      schema = next || {}
      view.dispatch({ effects: langConf.reconfigure(languageExt()) })
    },
    setCompletions (next) {
      paramNames = (next && next.paramNames) || paramNames
      datasetVars = (next && next.datasetVars) || datasetVars
    },
    focus () { view.focus() },
    destroy () { view.destroy() }
  }
}
