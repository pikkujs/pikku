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

    const structuredRecords: Array<Record<string, unknown>> = []
    for (const line of lines) {
      try {
        const payload = JSON.parse(line) as Record<string, unknown>
        if (
          typeof payload.level === 'string' &&
          typeof payload.message === 'string' &&
          typeof payload.timestamp === 'string'
        ) {
          structuredRecords.push(payload)
        }
      } catch {
        continue
      }
    }

    assert.ok(
      structuredRecords.length > 0,
      'Expected at least one structured JSON log record with timestamp'
    )

    for (const payload of structuredRecords) {
      assert.equal(typeof payload.level, 'string')
      assert.equal(typeof payload.message, 'string')
      assert.equal(typeof payload.timestamp, 'string')
    }
  })
})
