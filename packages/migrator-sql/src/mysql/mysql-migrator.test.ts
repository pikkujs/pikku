import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MysqlMigrationExecutor } from './mysql-migrator.js'

const recordingClient = (failOn?: RegExp) => {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  return {
    calls,
    client: {
      async query<T>(sql: string, params?: unknown[]) {
        calls.push({ sql: sql.trim(), params })
        if (failOn?.test(sql)) throw new Error('boom')
        return { rows: [] as T[] }
      },
    },
  }
}

test('runs the migration before recording it, with `?` placeholders', async () => {
  const { calls, client } = recordingClient()
  await new MysqlMigrationExecutor(client).runMigration(
    'CREATE TABLE a (id INT);',
    '0001-a.sql',
    'abc'
  )
  assert.equal(calls[0]!.sql, 'CREATE TABLE a (id INT);')
  assert.match(
    calls[1]!.sql,
    /^INSERT INTO sql_migrations \(name, hash\) VALUES \(\?, \?\)$/
  )
  assert.deepEqual(calls[1]!.params, ['0001-a.sql', 'abc'])
})

test('a migration that fails is not recorded as applied', async () => {
  const { calls, client } = recordingClient(/CREATE TABLE broken/)
  await assert.rejects(
    new MysqlMigrationExecutor(client).runMigration(
      'CREATE TABLE broken (id INT);',
      '0002-broken.sql',
      'def'
    ),
    /boom/
  )
  assert.equal(
    calls.filter((c) => /INSERT INTO sql_migrations/.test(c.sql)).length,
    0
  )
})

test('the tracking table is a VARCHAR key, because MySQL cannot index TEXT whole', async () => {
  const { calls, client } = recordingClient()
  await new MysqlMigrationExecutor(client).ensureTrackingTable()
  assert.match(calls[0]!.sql, /name\s+VARCHAR\(255\) PRIMARY KEY/)
})

test('recordMigration records without running anything', async () => {
  const { calls, client } = recordingClient()
  await new MysqlMigrationExecutor(client).recordMigration('0003-c.sql', 'h')
  assert.equal(calls.length, 1)
  assert.match(calls[0]!.sql, /^INSERT INTO sql_migrations/)
})
