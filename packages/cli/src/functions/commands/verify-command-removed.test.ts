import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const cliBin = join(cliRoot, 'dist/bin/pikku.js')

const runCli = (...args: string[]) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      // Async on purpose: bun's spawnSync can miss a child's exit and spin forever.
      execFile(
        process.execPath,
        [cliBin, ...args],
        { cwd: cliRoot, encoding: 'utf-8', timeout: 120_000 },
        (error, stdout, stderr) =>
          resolve({
            status: error
              ? typeof error.code === 'number'
                ? error.code
                : null
              : 0,
            stdout,
            stderr,
          })
      )
    }
  )

describe('pikku verify command removal', () => {
  test('`pikku verify` no longer exists — validate owns it now', async (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const help = await runCli('--help')
    const helpOutput = `${help.stdout}\n${help.stderr}`
    assert.doesNotMatch(helpOutput, /^\s*verify\s/m)
    const result = await runCli('verify', '--help')
    assert.doesNotMatch(
      `${result.stdout}\n${result.stderr}`,
      /Run codegen, type-check the backend/
    )
  })

  test('`pikku validate --help` carries the flags verify had', async (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const result = await runCli('validate', '--help')
    assert.equal(result.status, 0)
    const output = `${result.stdout}\n${result.stderr}`
    for (const flag of [
      'codegen',
      'strict',
      'skip-typecheck',
      'skip-frontends',
      'skip-deploy-checks',
      'migrations-base',
    ]) {
      assert.match(output, new RegExp(flag), `${flag} missing:\n${output}`)
    }
  })
})
