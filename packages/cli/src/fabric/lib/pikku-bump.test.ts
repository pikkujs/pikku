import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { takeBump } from './pikku-bump.js'

const install = (root: string, version: string) => {
  mkdirSync(join(root, 'node_modules/@pikku/core'), { recursive: true })
  writeFileSync(
    join(root, 'node_modules/@pikku/core/package.json'),
    JSON.stringify({ version })
  )
}

test('the first version is recorded, a later one is a bump, once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-bump-'))
  const store = join(root, '.git', 'pikku-changes.json')
  mkdirSync(join(root, '.git'))
  install(root, '0.12.1')
  assert.equal(await takeBump(root, store), null)
  assert.equal(await takeBump(root, store), null)
  install(root, '0.12.2')
  assert.deepEqual(await takeBump(root, store), { from: '0.12.1', to: '0.12.2' })
  assert.equal(await takeBump(root, store), null)
})
