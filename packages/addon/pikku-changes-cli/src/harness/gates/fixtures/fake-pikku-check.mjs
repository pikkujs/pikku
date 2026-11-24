#!/usr/bin/env node
// A stand-in for `pikku check --json` in the check gate's tests: it prints the real output of a
// type error (pikku-check/type-error.ndjson) when the checkout has src/broken.ts, else a clean run.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.argv.slice(2).join(' ') !== 'check --json --timeout 600') {
  process.stderr.write(
    `fake pikku: unexpected ${process.argv.slice(2).join(' ')}\n`
  )
  process.exit(2)
}
const broken = existsSync('src/broken.ts')
const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'pikku-check',
  broken ? 'type-error.ndjson' : 'clean.ndjson'
)
process.stdout.write(readFileSync(fixture, 'utf8'))
process.exit(broken ? 1 : 0)
