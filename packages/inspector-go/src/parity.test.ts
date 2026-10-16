import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The harness, run against the TypeScript stand-in binary misbehaving in
 * known ways, reports each the way the Go engine's gaps will show up.
 */

const PARITY = fileURLToPath(new URL('../parity/parity.ts', import.meta.url))
const STAND_IN = fileURLToPath(
  new URL('../parity/ts-reference-bin.ts', import.meta.url)
)
const PROJECT = fileURLToPath(
  new URL('../../../templates/functions', import.meta.url)
)

interface Section {
  section: string
  phase: string
  status: string
  allowedBy?: string
}

const harness = (env: Record<string, string>, extraArgs: string[] = []) => {
  const json = join(mkdtempSync(join(tmpdir(), 'pikku-parity-test-')), 'r.json')
  const run = spawnSync(
    'bun',
    [PARITY, '--project', PROJECT, '--json', json, ...extraArgs],
    {
      encoding: 'utf8',
      env: { ...process.env, PIKKU_INSPECTOR_GO_BIN: STAND_IN, ...env },
    }
  )
  const [result] = JSON.parse(readFileSync(json, 'utf8'))
  return {
    status: run.status,
    stdout: run.stdout,
    sections: result.sections as Section[],
    find: (section: string, phase: string) =>
      (result.sections as Section[]).find(
        (s) => s.section === section && s.phase === phase
      ),
  }
}

// Each case spawns the harness, which spawns a TypeScript inspection.
const HARNESS_TIMEOUT = { timeout: 120_000 }

describe('parity harness', () => {
  test(
    'the TypeScript engine is at parity with itself',
    HARNESS_TIMEOUT,
    () => {
      const run = harness({})
      assert.equal(run.status, 0, run.stdout)
      assert.deepEqual(
        run.sections.filter((s) => s.status !== 'ok'),
        []
      )
      assert.ok(run.find('functions', 'pre'))
      assert.ok(run.find('functions', 'post'))
      assert.ok(run.find('diagnostics.warn', 'post'))
    }
  )

  test(
    'customTypes printed in another order are a diff, not normalized away',
    HARNESS_TIMEOUT,
    () => {
      const run = harness({ PIKKU_TS_REFERENCE_REORDER: '1' })
      assert.equal(run.status, 1, run.stdout)
      assert.equal(run.find('functions', 'pre')?.status, 'diff')
      assert.equal(run.find('functions', 'pre')?.allowedBy, undefined)
    }
  )

  test(
    'a section the binary leaves out is not ported, and fails --strict',
    HARNESS_TIMEOUT,
    () => {
      const run = harness({ PIKKU_TS_REFERENCE_DROP: 'cli,scorers' })
      assert.equal(run.status, 0, run.stdout)
      assert.equal(run.find('cli', 'pre')?.status, 'not ported')
      assert.equal(run.find('cli', 'post')?.status, 'not ported')
      assert.equal(run.find('scorers', 'post')?.status, 'not ported')
      assert.match(run.stdout, /not ported/)

      const strict = harness({ PIKKU_TS_REFERENCE_DROP: 'cli' }, ['--strict'])
      assert.equal(strict.status, 1)
    }
  )

  test(
    'a diagnostic the reference never gave is a diff in both phases',
    HARNESS_TIMEOUT,
    () => {
      const run = harness({ PIKKU_TS_REFERENCE_EXTRA_WARN: 'surprise' })
      assert.equal(run.status, 1)
      assert.equal(run.find('diagnostics.warn', 'pre')?.status, 'diff')
      assert.equal(run.find('diagnostics.warn', 'post')?.status, 'diff')
      assert.match(run.stdout, /\+ go only: surprise/)
    }
  )
})
