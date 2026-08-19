import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@niqer/pdf': path.resolve('D:/niqer-pdf/src/index.js'),
      '@niqer/barcode': path.resolve('D:/niqer-barcode/src/index.js')
    }
  },
  build: {
    lib: {
      entry: path.resolve(root, 'src/index.js'),
      formats: ['es'],
      fileName: () => 'index.js'
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: false
  }
})
