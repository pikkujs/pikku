import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { generateMigrations, resolveDb } from './local-db.js'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-retired-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

test('a retired db/annotations.ts refuses generate before anything is written', async () => {
  mkdirSync(join(root, 'db'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'annotations.ts'),
    'export const annotations = {}\n'
  )
  const resolved = resolveDb(
    { sqliteDb: 'dev.db' },
    root,
    join(root, '.pikku')
  )!

  await assert.rejects(
    () =>
      generateMigrations(
        resolved,
        root,
        ['src'],
        { error: () => {} },
        [],
        new Set(['workflow'])
      ),
    /db\/annotations\.ts is no longer read/
  )
  const dir = join(root, 'db', 'sqlite')
  assert.deepEqual(existsSync(dir) ? readdirSync(dir) : [], [])
})
