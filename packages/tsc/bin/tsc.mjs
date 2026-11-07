#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

export const DEFAULT_TSC = 'tsrs'

const ENGINES = {
  tsrs: ['tsrs', 'tsrs'],
  ts7: ['@typescript/native', 'tsc'],
}

const engine = process.env.PIKKU_TSC || DEFAULT_TSC
if (!ENGINES[engine]) {
  console.error(`tsc: PIKKU_TSC=${engine} is not one of ${Object.keys(ENGINES).join(', ')}`)
  process.exit(2)
}

// Both packages restrict `exports`, so the bin is found on disk and read from
// the package's own `bin` field rather than through require.resolve.
const [pkg, binName] = ENGINES[engine]
const dir = createRequire(import.meta.url)
  .resolve.paths(pkg)
  .map((p) => join(p, pkg))
  .find((d) => existsSync(join(d, 'package.json')))
if (!dir) {
  console.error(`tsc: the ${engine} engine (${pkg}) is not installed; run bun install`)
  process.exit(2)
}
const { bin } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
const result = spawnSync(process.execPath, [join(dir, typeof bin === 'string' ? bin : bin[binName]), ...process.argv.slice(2)], {
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
