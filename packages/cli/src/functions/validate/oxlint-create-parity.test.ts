import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { newOxlintConfig } from './oxlint-enable.js'
import { ensureOxlintSetup } from '../../../../create/src/utils.js'

test('create-pikku writes the policy rules and exemption `pikku enable oxlint` writes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-create-oxlint-'))
  try {
    await writeFile(join(dir, 'package.json'), '{}')
    ensureOxlintSetup(dir)
    const created = JSON.parse(
      await readFile(join(dir, '.oxlintrc.json'), 'utf8')
    )
    const enabled = newOxlintConfig()
    assert.deepEqual(created.rules, enabled.rules)
    assert.deepEqual(created.overrides, enabled.overrides)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
