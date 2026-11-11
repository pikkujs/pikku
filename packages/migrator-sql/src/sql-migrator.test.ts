import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  baselineMigrations,
  migrate,
  MigrationFailedError,
  pendingMigrations,
} from './sql-migrator.js'
import { SqliteMigrationExecutor } from './sqlite/sqlite-migrator.js'
import { loadSqliteRuntime } from './sqlite/sqlite-runtime.js'

/**
 * What macOS bsdtar packs beside every file that has extended attributes: a
 * binary AppleDouble header, NUL first, under the same name with `._` prefixed.
 */
const appleDouble = (): Buffer => {
  const blob = Buffer.alloc(163)
  blob.writeUInt32BE(0x00051607, 0)
  blob.writeUInt32BE(0x00020000, 4)
  blob.write('Mac OS X        ', 8, 'ascii')
  return blob
}

const withMigrations = async (
  files: Record<string, string | Buffer>,
  body: (dir: string, executor: SqliteMigrationExecutor) => Promise<void>
) => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-migrator-'))
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content)
  }
  const db = (await loadSqliteRuntime()).open(':memory:')
  try {
    await body(dir, new SqliteMigrationExecutor(db))
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const REAL_MIGRATIONS = {
  '0001-animal.sql': 'CREATE TABLE animal (id TEXT PRIMARY KEY);',
  '0002-owner.sql': 'CREATE TABLE owner (id TEXT PRIMARY KEY);',
}

test('an AppleDouble ._ file beside a migration is not applied', async () => {
  await withMigrations(
    { ...REAL_MIGRATIONS, '._0001-animal.sql': appleDouble() },
    async (dir, executor) => {
      const result = await migrate(executor, dir)
      assert.deepEqual(result.applied, ['0001-animal.sql', '0002-owner.sql'])
      assert.deepEqual(result.skipped, [])
    }
  )
})

test('a dotfile is neither pending nor baselined', async () => {
  await withMigrations(
    { ...REAL_MIGRATIONS, '._0001-animal.sql': appleDouble() },
    async (dir, executor) => {
      assert.deepEqual(pendingMigrations(dir, []), [
        '0001-animal.sql',
        '0002-owner.sql',
      ])
      assert.deepEqual(await baselineMigrations(executor, dir), [
        '0001-animal.sql',
        '0002-owner.sql',
      ])
    }
  )
})

test('a migration that fails names the file it came from', async () => {
  await withMigrations(
    { ...REAL_MIGRATIONS, '0003-broken.sql': 'CREATE TABLE (' },
    async (dir, executor) => {
      await assert.rejects(migrate(executor, dir), (err: unknown) => {
        assert.ok(err instanceof MigrationFailedError)
        assert.equal(err.file, '0003-broken.sql')
        assert.match(err.message, /0003-broken\.sql/)
        assert.ok(err.cause instanceof Error)
        assert.ok(err.message.includes(err.cause.message))
        return true
      })
      assert.deepEqual(
        (await executor.getApplied()).map((row) => row.name),
        ['0001-animal.sql', '0002-owner.sql']
      )
    }
  )
})
