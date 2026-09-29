import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const cliRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../..' // packages/cli
)
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

describe('pikku tests command removal (#865)', () => {
  test('`pikku tests` no longer exists — scenarios own coverage now', async (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const help = await runCli('--help')
    const helpOutput = `${help.stdout}\n${help.stderr}`
    assert.doesNotMatch(
      helpOutput,
      /^\s*tests\s/m,
      `'tests' still listed in pikku --help:\n${helpOutput}`
    )
    const result = await runCli('tests', '--help')
    const output = `${result.stdout}\n${result.stderr}`
    assert.doesNotMatch(
      output,
      /Manage function tests/,
      `'pikku tests' still registered:\n${output}`
    )
  })

  test('`pikku scenario --help` is the replacement and still works', async (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const result = await runCli('scenario', '--help')
    assert.equal(
      result.status,
      0,
      `expected 'pikku scenario --help' to succeed:\n${result.stdout}\n${result.stderr}`
    )
    assert.match(result.stdout, /scenario/i)
  })
})
