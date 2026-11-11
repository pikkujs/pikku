import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliBin = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../dist/bin/pikku.js'
)

let root: string

const validate = (...args: string[]) =>
  new Promise<{ status: number | null; stdout: string }>((resolve) => {
    // Async on purpose: bun's spawnSync can miss a child's exit and spin forever.
    execFile(
      process.execPath,
      [cliBin, 'validate', '--skipDeployChecks', ...args],
      { cwd: root, encoding: 'utf-8', timeout: 120_000 },
      (error, stdout) =>
        resolve({
          status: error
            ? typeof error.code === 'number'
              ? error.code
              : null
            : 0,
          stdout,
        })
    )
  })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-validate-exit-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'app', type: 'module' })
  )
  writeFileSync(
    join(root, 'pikku.config.json'),
    JSON.stringify({
      tsconfig: 'tsconfig.json',
      srcDirectories: ['src'],
      backends: { api: { filter: {} } },
    })
  )
  writeFileSync(join(root, 'tsconfig.json'), '{}')
  mkdirSync(join(root, 'src'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('pikku validate', () => {
  test('exits non-zero when a check reports an error', async (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const { status, stdout } = await validate('--skipTypecheck')
    assert.match(stdout, /error/)
    assert.equal(status, 1)
  })

  test('--json prints the whole report as one line', async (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const { stdout } = await validate('--skipTypecheck', '--json')
    const line = stdout.split('\n').find((l) => l.startsWith('{"ok"'))
    assert.ok(line, stdout)
    const report = JSON.parse(line)
    assert.equal(report.ok, false)
    assert.ok(
      report.ran.some((r: { checkId: string }) => r.checkId === 'verify')
    )
  })
})
