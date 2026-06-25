#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { generateEnumsSource, parseDbEnums } from './generate-enums.js'

// Standalone generator for CI / non-Vite flows: run right after
// `paraglide-js compile`. The Vite plugin (`@pikku/paraglide/vite`) covers dev.
//   paraglide-enums <catalog.json> <out.gen.ts> [messagesImport] [enums.gen.ts]
const [catalog, outFile, messagesImport, enumsFile] = process.argv.slice(2)
if (!catalog || !outFile) {
  console.error('usage: paraglide-enums <catalog.json> <out.gen.ts> [messagesImport] [enums.gen.ts]')
  process.exit(1)
}
const catalogPath = resolve(catalog)
if (!existsSync(catalogPath)) {
  console.error(`[paraglide-enums] catalog not found: ${catalogPath}`)
  process.exit(1)
}
const data = JSON.parse(readFileSync(catalogPath, 'utf8')) as Record<string, unknown>
const keys = Object.keys(data).filter((k) => !k.startsWith('$'))

let dbEnums
let enumsImport
if (enumsFile && existsSync(resolve(enumsFile))) {
  dbEnums = parseDbEnums(readFileSync(resolve(enumsFile), 'utf8'))
  let rel = relative(dirname(resolve(outFile)), resolve(enumsFile)).replace(/\.ts$/, '.js')
  if (!rel.startsWith('.')) rel = `./${rel}`
  enumsImport = rel
}

const src = generateEnumsSource(keys, {
  ...(messagesImport ? { messagesImport } : {}),
  ...(dbEnums ? { dbEnums } : {}),
  ...(enumsImport ? { enumsImport } : {}),
  onWarn: (msg) => console.warn(`[paraglide-enums] ${msg}`),
})
const outPath = resolve(outFile)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, src)
console.log(`[paraglide-enums] wrote ${outFile}`)
