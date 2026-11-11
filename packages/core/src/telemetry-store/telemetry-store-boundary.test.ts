import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(here, '..')

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(join(dir, e.name))
      : e.name.endsWith('.ts')
        ? [join(dir, e.name)]
        : []
  )

describe('the telemetry store subpath boundary', () => {
  test('the types subpath has no value import or export', () => {
    for (const file of ['index.ts', 'telemetry-store.types.ts']) {
      const lines = readFileSync(join(here, file), 'utf-8').split('\n')
      const offenders = lines.filter(
        (l) =>
          /^\s*(import|export)\b/.test(l) &&
          !/^\s*(import|export)\s+type\b/.test(l) &&
          !/^\s*export\s+(interface|type)\b/.test(l)
      )
      assert.deepEqual(offenders, [], `${file} carries a value statement`)
    }
  })

  test('nothing outside telemetry-store/testing imports the testing subpath', () => {
    const offenders = sources(srcRoot)
      .filter((f) => !f.startsWith(join(here, 'testing')))
      .filter((f) => !f.endsWith('edge-clean.test.ts'))
      .filter(
        (f) =>
          /telemetry-store\/testing/.test(readFileSync(f, 'utf-8')) &&
          /(from|import\()\s*['"][^'"]*telemetry-store\/testing/.test(
            readFileSync(f, 'utf-8')
          )
      )
    assert.deepEqual(offenders, [])
  })
})
