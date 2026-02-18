import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const thisDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(thisDir, '..')
const runTestsScriptPath = path.join(packageRoot, 'run-tests.sh')

describe('run-tests.sh discovery behavior', () => {
  test('returns success by default when no tests are found', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pikku-core-tests-'))
    const srcDir = path.join(tempDir, 'src')
    fs.mkdirSync(srcDir, { recursive: true })
    fs.copyFileSync(runTestsScriptPath, path.join(tempDir, 'run-tests.sh'))

    const result = spawnSync('bash', ['run-tests.sh'], {
      cwd: tempDir,
      encoding: 'utf8',
      env: { ...process.env, CI: 'false' },
    })

    assert.equal(result.status, 0)
    assert.match(result.stdout, /No test files found matching pattern/)

    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('returns failure in strict mode when no tests are found', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pikku-core-tests-'))
    const srcDir = path.join(tempDir, 'src')
    fs.mkdirSync(srcDir, { recursive: true })
    fs.copyFileSync(runTestsScriptPath, path.join(tempDir, 'run-tests.sh'))

    const result = spawnSync('bash', ['run-tests.sh'], {
      cwd: tempDir,
      encoding: 'utf8',
      env: { ...process.env, STRICT_TEST_DISCOVERY: '1' },
    })

    assert.equal(result.status, 1)
    assert.match(result.stdout, /No test files found matching pattern/)

    fs.rmSync(tempDir, { recursive: true, force: true })
  })
})
