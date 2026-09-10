import * as esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'src/print-tool/pdf-paint-worker.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: path.join(root, 'dist/pdf-paint-worker.js'),
  alias: {
    '@niqer/pdf': path.join(root, 'node_modules/@niqer/pdf/src/index.js'),
    '@niqer/barcode': path.join(root, 'node_modules/@niqer/barcode/src/index.js')
  }
})
