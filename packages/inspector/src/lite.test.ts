import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const COMPILER_MODULES =
  /\/node_modules\/(typescript|ts-json-schema-generator)\//

/**
 * Imports `entry` in a fresh bun process and lists every compiler module that
 * ended up loaded. A fresh process, because this test file's own imports would
 * otherwise already be in the module cache.
 */
const compilerModulesLoadedBy = async (entry: string): Promise<string[]> => {
  const script = `
    await import(${JSON.stringify(entry)})
    console.log(JSON.stringify(Object.keys(require.cache)))
  `
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['-e', script],
    { encoding: 'utf-8' }
  )
  const loaded: string[] = JSON.parse(stdout.trim().split('\n').pop()!)
  return loaded.filter((path) => COMPILER_MODULES.test(path))
}

describe('@pikku/inspector/lite', () => {
  test('loads without the TypeScript compiler', async () => {
    const lite = fileURLToPath(new URL('./lite.ts', import.meta.url))
    assert.deepEqual(await compilerModulesLoadedBy(lite), [])
  })

  test('the full entry point does load it, so the check above can fail', async () => {
    const index = fileURLToPath(new URL('./index.ts', import.meta.url))
    assert.notDeepEqual(await compilerModulesLoadedBy(index), [])
  })
})
