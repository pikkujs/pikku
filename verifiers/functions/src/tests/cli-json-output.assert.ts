import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('pikku cli json output verifier', () => {
  test('emits NDJSON records for real CLI run', () => {
    const verifierRoot = join(__dirname, '..', '..')
    const repoRoot = join(__dirname, '..', '..', '..', '..')
    const pikkuCliEntry = join(
      repoRoot,
      'packages',
      'cli',
      'dist',
      'bin',
      'pikku.js'
    )

    const result = spawnSync(
      'node',
      [pikkuCliEntry, 'all', '--output', 'json'],
      {
        cwd: verifierRoot,
        encoding: 'utf-8',
      }
    )

    assert.equal(result.status, 0, result.stderr || 'CLI run failed')

    const lines = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    assert.ok(lines.length > 0, 'Expected CLI output lines')

    const structuredRecords = lines.map((line, index) => {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(line) as Record<string, unknown>
      } catch {
        assert.fail(`Line ${index + 1} is not valid JSON: ${line}`)
      }

      assert.equal(
        typeof payload.level,
        'string',
        `Line ${index + 1} missing string "level": ${line}`
      )
      assert.equal(
        typeof payload.message,
        'string',
        `Line ${index + 1} missing string "message": ${line}`
      )
      assert.equal(
        typeof payload.timestamp,
        'string',
        `Line ${index + 1} missing string "timestamp": ${line}`
      )
      return payload
    })

    assert.ok(
      structuredRecords.length > 0,
      'Expected at least one structured JSON log record'
    )
  })
})
