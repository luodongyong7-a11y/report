import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
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
