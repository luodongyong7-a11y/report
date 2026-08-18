import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const root = 'D:/tk-report'
const spec = '19ff28140376ad5d91c27afd3f68718172a830bd'
const files = [
  'packages/report-vue/src/style.css',
  'packages/report-vue/src/views/designer/PrintDesignerView.vue',
  'packages/report-vue/src/components/designer/Toolbar.vue',
  'packages/report-vue/src/components/designer/DesignArea.vue',
  'packages/report-vue/src/components/designer/TemplatesPanel.vue',
  'packages/report-vue/src/components/designer/ParamPanel.vue',
  'packages/report-vue/src/components/designer/DatasetPanel.vue',
  'packages/report-vue/src/components/designer/PropertiesPanel.vue'
]

function readSpec (rel) {
  return execFileSync('git', ['show', spec + ':' + rel], { cwd: root, encoding: 'utf8' })
}

function extract (rel) {
  const text = readSpec(rel)
  if (rel.endsWith('.css')) return text
  const start = text.search(/<style[\s\S]*?>/)
  const end = text.lastIndexOf('</style>')
  if (start < 0 || end < 0) return ''
  const openEnd = text.indexOf('>', start)
  return text.slice(openEnd + 1, end)
}

let css = ''
for (const f of files) {
  css += '\n/* ' + spec.slice(0, 7) + ' ' + f + ' */\n' + extract(f) + '\n'
}
css = css.replace(/:root\s*\{/g, ':host, .tk-ui {')
css = css.replace(/:deep\(([^)]+)\)/g, '$1')
const dest = path.join(root, 'oss/niqer-report/src/print-tool/vue-clone-css.js')
fs.writeFileSync(dest, 'export const VUE_CLONE_CSS = ' + JSON.stringify(css) + '\n', 'utf8')
console.log(dest, css.length, spec)
