import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * The console addon is bundled into Next.js apps and reaches this package
 * through @pikku/code-edit. webpack reads `new URL('…', import.meta.url)` as an
 * asset to bundle, and fails on `../prebuilt`, which only exists after a
 * release build.
 */
test('no source file builds a path with new URL(…, import.meta.url)', () => {
  const offenders = readdirSync(here)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .filter((name) =>
      /new URL\([^)]*import\.meta\.url/.test(
        withoutComments(readFileSync(join(here, name), 'utf8'))
      )
    )
  assert.deepEqual(offenders, [])
})
