import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const COMPILER_MODULES =
  /\/node_modules\/(typescript|ts-json-schema-generator)\//

/**
 * Every command statically imports the whole CLI graph, so whatever that graph
 * loads at module evaluation is paid by `pikku --help` too. The compiler is
 * the largest of it and only the commands that inspect need it; they reach it
 * through a dynamic `import('@pikku/inspector')`.
 *
 * A fresh process, because this file's own imports would otherwise already be
 * in the module cache.
 */
describe('CLI startup', () => {
  test('loading the CLI entry does not load the TypeScript compiler', async () => {
    const entry = fileURLToPath(
      new URL('../.pikku/cli/pikku-cli.gen.ts', import.meta.url)
    )
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
    assert.ok(loaded.length > 100, 'the CLI graph was not loaded at all')
    assert.deepEqual(
      loaded.filter((path) => COMPILER_MODULES.test(path)),
      []
    )
  })
})
