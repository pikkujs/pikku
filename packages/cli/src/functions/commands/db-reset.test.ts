import assert from 'node:assert/strict'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dbReset } from './db-reset.js'
import { resolveDb } from '../db/local-db.js'
import { loadSqliteRuntime } from '../db/sqlite/sqlite-runtime.js'

/**
 * Drives the real command against a real sqlite database, so `--no-seed` is
 * proven by the rows that do or don't land rather than by a stub.
 *
 * The seed fixture is deliberately a plain `INSERT` with no `OR IGNORE`: reset
 * is the only path to it, and it always arrives at a database it has just
 * wiped, so a seed that could not survive being applied twice is correct.
 */
let root: string
let logs: string[]

const logger = {
  info: (msg: string) => logs.push(msg),
  warn: (msg: string) => logs.push(msg),
  error: (msg: string) => logs.push(msg),
  debug: () => {},
  diagnostic: () => {},
} as any

const config = () => ({
  rootDir: root,
  outDir: join(root, '.pikku'),
  runtimeDir: join(root, '.pikku-runtime'),
  srcDirectories: ['src'],
})

const todoCount = async () => {
  const resolved = resolveDb({ sqliteDb: '.pikku-runtime/dev.db' }, root, root)!
  if (resolved.dialect !== 'sqlite') throw new Error('expected sqlite')
  const runtime = await loadSqliteRuntime()
  const db = runtime.open(resolved.dbFile)
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM todos').get() as {
      c: number
    }
    return row.c
  } finally {
    db.close()
  }
}

beforeEach(() => {
  logs = []
  root = mkdtempSync(join(tmpdir(), 'pikku-db-reset-'))
  mkdirSync(join(root, 'db', 'sqlite'), { recursive: true })
  mkdirSync(join(root, '.pikku-runtime'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'sqlite', '0001-init.sql'),
    `CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL
);
`
  )
  writeFileSync(
    join(root, 'db', 'sqlite-dev-seed.sql'),
    `INSERT INTO todos (title) VALUES ('walk dog');
INSERT INTO todos (title) VALUES ('buy milk');
`
  )
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('pikku db reset', () => {
  test('migrates and seeds by default', async () => {
    await dbReset.func({ logger, config: config() } as any, {} as any)

    assert.equal(await todoCount(), 2)
    assert.ok(
      logs.some((l) => l.includes('sqlite-dev-seed.sql')),
      `expected a seed log line, got:\n${logs.join('\n')}`
    )
  })

  test('--no-seed migrates but leaves the database empty', async () => {
    await dbReset.func(
      { logger, config: config() } as any,
      {
        noSeed: true,
      } as any
    )

    assert.equal(await todoCount(), 0)
    assert.ok(
      logs.some((l) => l.includes('leaving the database empty')),
      `expected the --no-seed log line, got:\n${logs.join('\n')}`
    )
    assert.ok(
      !logs.some((l) => l.includes('seeded')),
      `--no-seed still seeded:\n${logs.join('\n')}`
    )
  })

  test('a non-idempotent seed survives repeated resets', async () => {
    await dbReset.func({ logger, config: config() } as any, {} as any)
    await dbReset.func({ logger, config: config() } as any, {} as any)

    assert.equal(await todoCount(), 2)
  })
})
