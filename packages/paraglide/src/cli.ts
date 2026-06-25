#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { generateEnumsSource } from './generate-enums.js'

// Standalone generator for CI / non-Vite flows: run right after
// `paraglide-js compile`. The Vite plugin (`@pikku/paraglide/vite`) covers dev.
const [catalog, outFile, messagesImport] = process.argv.slice(2)
if (!catalog || !outFile) {
  console.error('usage: paraglide-enums <catalog.json> <out.gen.ts> [messagesImport]')
  process.exit(1)
}
const catalogPath = resolve(catalog)
if (!existsSync(catalogPath)) {
  console.error(`[paraglide-enums] catalog not found: ${catalogPath}`)
  process.exit(1)
}
const data = JSON.parse(readFileSync(catalogPath, 'utf8')) as Record<string, unknown>
const keys = Object.keys(data).filter((k) => !k.startsWith('$'))
const src = generateEnumsSource(keys, {
  ...(messagesImport ? { messagesImport } : {}),
  onWarn: (msg) => console.warn(`[paraglide-enums] ${msg}`),
})
const outPath = resolve(outFile)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, src)
console.log(`[paraglide-enums] wrote ${outFile}`)
