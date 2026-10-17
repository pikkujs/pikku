import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Loads `entry` in a fresh process and reports which compiler modules ended up
 * in the module cache. A fresh process is the only honest answer: this test
 * file's own process has long since loaded `typescript` through its siblings.
 */
const compilerModulesLoadedBy = (entry: string): string[] => {
  const script = `
    import { createRequire } from 'node:module'
    await import(${JSON.stringify(entry)})
    const cache = createRequire(import.meta.url).cache
    const loaded = Object.keys(cache).filter((k) =>
      /\\/node_modules\\/(typescript|ts-json-schema-generator)\\//.test(k)
    )
    console.log(JSON.stringify(loaded))
  `
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout.trim().split('\n').pop()!)
}

describe('@pikku/inspector/finalize', () => {
  test('never loads typescript', () => {
    const finalize = fileURLToPath(new URL('./finalize.ts', import.meta.url))
    assert.deepEqual(compilerModulesLoadedBy(finalize), [])
  })

  test('the probe does see typescript when an entry loads it', () => {
    const index = fileURLToPath(new URL('./index.ts', import.meta.url))
    assert.notDeepEqual(compilerModulesLoadedBy(index), [])
  })
})
