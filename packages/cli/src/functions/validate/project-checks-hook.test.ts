import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProjectValidate, guardProjectChecks } from './validate.js'

const finding = {
  id: 'from-hook',
  severity: 'info' as const,
  message: 'hook ran',
  path: '/x',
  fixHint: '',
}

async function appDir() {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-hook-'))
  await writeFile(join(dir, 'package.json'), '{}')
  await writeFile(join(dir, 'pikku.config.json'), '{}')
  return dir
}

describe('project-aware checks hook', () => {
  test('its findings join the report', async () => {
    const dir = await appDir()
    try {
      const seen: string[] = []
      const result = await runProjectValidate(dir, {
        skipTypecheck: true,
        projectChecks: async ({ root }) => {
          seen.push(root)
          return [finding]
        },
      })
      assert.deepEqual(seen, [dir])
      assert.ok(result.findings.some((f) => f.id === 'from-hook'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('without a hook only the offline checks run', async () => {
    const dir = await appDir()
    try {
      const result = await runProjectValidate(dir, { skipTypecheck: true })
      assert.ok(!result.findings.some((f) => f.id === 'from-hook'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('a hook that fails is an info, never a silent green', async () => {
    const guarded = guardProjectChecks(async () => {
      throw new Error('function not found')
    })
    const [f] = await guarded({ root: '/r' })
    assert.equal(f.id, 'project-checks-skipped')
    assert.equal(f.severity, 'info')
    assert.match(f.message, /did not run/)
  })

  test('during a deploy the same failure is an error', async () => {
    const guarded = guardProjectChecks(async () => {
      throw new Error('offline')
    })
    const [f] = await guarded({ root: '/r', deployTarget: 'main' })
    assert.equal(f.severity, 'error')
  })
})
