import JavaScriptObfuscator from 'javascript-obfuscator'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const target = path.join(root, 'dist', 'index.js')
const source = readFileSync(target, 'utf8')
const obfuscated = JavaScriptObfuscator.obfuscate(source, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.85,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.85,
  sourceMap: false,
  sourceType: 'module',
  target: 'browser',
  ignoreImports: true
}).getObfuscatedCode()
writeFileSync(target, obfuscated, 'utf8')
