import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSqliteRuntime } from '@pikku/migrator-sql/sqlite'
import { annotateDeclaredKinds, kindForDeclaredType } from './db-annotate.js'
import { loadClassifications, resolveDb } from './local-db.js'

let root: string

const resolved = () =>
  resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
const annotations = () => join(root, 'db', 'annotations.ts')

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'pikku-db-annotate-'))
  mkdirSync(join(root, '.pikku-runtime'), { recursive: true })
  mkdirSync(join(root, 'db'), { recursive: true })
  const db = (await loadSqliteRuntime()).open(
    join(root, '.pikku-runtime', 'dev.db')
  )
  db.exec(`CREATE TABLE todo (
    id INTEGER PRIMARY KEY,
    done BOOLEAN NOT NULL DEFAULT 0,
    due_at TIMESTAMP,
    created TEXT DEFAULT (datetime('now')),
    meta JSON
  )`)
  db.close()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('pikku db annotate', () => {
  test('maps declared types, ignoring size suffixes and defaults', () => {
    assert.equal(kindForDeclaredType('boolean'), 'bool')
    assert.equal(kindForDeclaredType('DATETIME'), 'date')
    assert.equal(kindForDeclaredType('JSONB'), 'json')
    assert.equal(kindForDeclaredType('NUMERIC(10,2)'), null)
    assert.equal(kindForDeclaredType('TEXT'), null)
  })

  test('writes kinds into a fresh file, keeping a header comment', async () => {
    writeFileSync(annotations(), '// mine\nexport const classifications = {}\n')
    const result = await annotateDeclaredKinds(resolved())
    assert.equal(result.status, 'written')
    assert.ok(readFileSync(annotations(), 'utf8').startsWith('// mine\n'))
    assert.deepEqual(
      JSON.parse(JSON.stringify(loadClassifications(annotations()))),
      {
        todo: {
          done: { kind: 'bool' },
          due_at: { kind: 'date' },
          meta: { kind: 'json' },
        },
      }
    )
    assert.equal((await annotateDeclaredKinds(resolved())).status, 'up-to-date')
  })

  test('leaves a file with hand-written fields alone and reports what is missing', async () => {
    const source = `export const classifications = { todo: { meta: { kind: 'json', tsType: 'Meta' } } }\n`
    writeFileSync(annotations(), source)
    const result = await annotateDeclaredKinds(resolved())
    assert.equal(result.status, 'skipped-manual')
    assert.deepEqual(result.status === 'skipped-manual' && result.missing, [
      'todo.done: bool',
      'todo.due_at: date',
    ])
    assert.equal(readFileSync(annotations(), 'utf8'), source)
  })
})
