import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const niqerReport = path.resolve(repoRoot, 'packages/report')

function niqerReportRaw () {
  const src = path.resolve(niqerReport, 'dist/index.js')
  return {
    name: 'niqer-report-raw',
    apply: 'build',
    transformIndexHtml () {
      return [{
        tag: 'script',
        attrs: { type: 'module', src: '/niqer-report.js' },
        injectTo: 'head-prepend'
      }]
    },
    writeBundle (options) {
      if (!fs.existsSync(src)) throw new Error('missing packages/report dist, run build in packages/report first')
      fs.copyFileSync(src, path.join(options.dir, 'niqer-report.js'))
      const worker = path.resolve(niqerReport, 'dist/pdf-paint-worker.js')
      if (!fs.existsSync(worker)) throw new Error('missing dist/pdf-paint-worker.js')
      fs.copyFileSync(worker, path.join(options.dir, 'pdf-paint-worker.js'))
    }
  }
}

export default defineConfig(({ mode }) => {
  const alias = {}
  if (mode !== 'production') {
    alias['@niqer/report'] = path.resolve(niqerReport, 'src/index.js')
  }
  return {
    plugins: [niqerReportRaw()],
    resolve: { alias },
    server: {
      port: 5174,
      host: true,
      fs: { allow: [repoRoot] },
      proxy: {
        '/report': { target: 'http://127.0.0.1:8088', changeOrigin: true },
        '/auth': { target: 'http://127.0.0.1:8088', changeOrigin: true },
        '/health': { target: 'http://127.0.0.1:8088', changeOrigin: true }
      }
    }
  }
})
