import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const cliBin = join(cliRoot, 'dist/bin/pikku.js')

const runCli = (...args: string[]) =>
  spawnSync(process.execPath, [cliBin, ...args], {
    cwd: cliRoot,
    encoding: 'utf-8',
    timeout: 120_000,
  })

describe('pikku console command removal (#870)', () => {
  test('`pikku console` no longer exists — dev serves the console instead', (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const help = runCli('--help')
    const helpOutput = `${help.stdout}\n${help.stderr}`
    assert.doesNotMatch(
      helpOutput,
      /^\s*console\s/m,
      `'console' still listed in pikku --help:\n${helpOutput}`
    )
    const result = runCli('console', '--help')
    const output = `${result.stdout}\n${result.stderr}`
    assert.doesNotMatch(
      output,
      /Start the Pikku Console UI/,
      `'pikku console' still registered:\n${output}`
    )
  })

  test('`pikku serve --help` exposes the explicit --console flag', (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const result = runCli('serve', '--help')
    assert.equal(
      result.status,
      0,
      `expected 'pikku serve --help' to succeed:\n${result.stdout}\n${result.stderr}`
    )
    assert.match(
      result.stdout,
      /--console/,
      `--console missing from serve help:\n${result.stdout}`
    )
  })
})
