import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const cliRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../..' // packages/cli
)
const cliBin = join(cliRoot, 'dist/bin/pikku.js')

const runCli = (...args: string[]) =>
  spawnSync(process.execPath, [cliBin, ...args], {
    cwd: cliRoot,
    encoding: 'utf-8',
    timeout: 120_000,
  })

describe('pikku tests command removal (#865)', () => {
  test('`pikku tests` no longer exists — scenarios own coverage now', (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const help = runCli('--help')
    const helpOutput = `${help.stdout}\n${help.stderr}`
    assert.doesNotMatch(
      helpOutput,
      /^\s*tests\s/m,
      `'tests' still listed in pikku --help:\n${helpOutput}`
    )
    const result = runCli('tests', '--help')
    const output = `${result.stdout}\n${result.stderr}`
    assert.doesNotMatch(
      output,
      /Manage function tests/,
      `'pikku tests' still registered:\n${output}`
    )
  })

  test('`pikku scenario --help` is the replacement and still works', (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const result = runCli('scenario', '--help')
    assert.equal(
      result.status,
      0,
      `expected 'pikku scenario --help' to succeed:\n${result.stdout}\n${result.stderr}`
    )
    assert.match(result.stdout, /scenario/i)
  })
})
