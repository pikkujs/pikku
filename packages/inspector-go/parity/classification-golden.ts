/**
 * Writes the diagnostics.golden.json of the classification fixtures from the
 * TypeScript inspector: the reference internal/analyze/classification_test.go
 * holds the Go port to.
 *
 *   node parity/classification-golden.ts [--check]
 *
 * --check exits 1 when a committed golden no longer matches, which is how a
 * change to the TS checks shows up as a port still to make.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runTypeScript } from './run-ts.ts'

const CODES = new Set(['PKU910', 'PKU953', 'PKU954'])

let stale = false
for (const fixture of ['classification']) {
  const project = fileURLToPath(
    new URL(`../testdata/${fixture}`, import.meta.url)
  )
  const goldenFile = `${project}/diagnostics.golden.json`
  const entries = runTypeScript('reference', project)
    .preDiagnostics.filter((d) => d.code && CODES.has(d.code))
    .map(({ code, message }) => ({ code, message }))
  const golden = `${JSON.stringify(entries, null, 2)}\n`

  if (!process.argv.includes('--check')) {
    writeFileSync(goldenFile, golden)
    console.log(`${fixture}: wrote ${entries.length} diagnostics`)
  } else if (readFileSync(goldenFile, 'utf8') === golden) {
    console.log(`${fixture}: ${entries.length} diagnostics match`)
  } else {
    console.error(
      `${fixture}: golden is stale against the TypeScript inspector`
    )
    stale = true
  }
}
process.exit(stale ? 1 : 0)
