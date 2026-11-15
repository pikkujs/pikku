import test, { describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  beforeDataChanges,
  mysqlProbeExecutor,
  postgresProbeExecutor,
} from './check-probe.js'

const recorder = () => {
  const queries: string[] = []
  return {
    queries,
    client: {
      query: async (sql: string) => {
        queries.push(sql)
        return { rows: [{ one: 1 }] }
      },
    },
  }
}

/** A client that answers the session's current limit as `previous`, and records what it is sent. */
const withPreviousLimit = (previous: unknown) => {
  const queries: string[] = []
  return {
    queries,
    client: {
      query: async (sql: string) => {
        queries.push(sql)
        return /@@SESSION\.max_execution_time/.test(sql)
          ? { rows: [{ previous }] }
          : { rows: [{ one: 1 }] }
      },
    },
  }
}

test('the MySQL probe runs under max_execution_time, so the server cancels it, and puts back the limit the session had', async () => {
  const { client, queries } = withPreviousLimit('5000')
  const rows = await mysqlProbeExecutor(client)('SELECT 1', 30_000)
  assert.deepEqual(rows, [{ one: 1 }])
  assert.deepEqual(queries, [
    'SELECT @@SESSION.max_execution_time AS previous',
    'SET SESSION max_execution_time = 30000',
    'SELECT 1',
    'SET SESSION max_execution_time = 5000',
  ])
})

test('the MySQL probe puts back no limit (0) when the session had none', async () => {
  const { client, queries } = withPreviousLimit(0)
  await mysqlProbeExecutor(client)('SELECT 1', 1000)
  assert.equal(queries.at(-1), 'SET SESSION max_execution_time = 0')
})

test('the MySQL probe restores the previous limit when the scan fails', async () => {
  const queries: string[] = []
  const client = {
    query: async (sql: string) => {
      queries.push(sql)
      if (/@@SESSION/.test(sql)) return { rows: [{ previous: 7000 }] }
      if (sql === 'SELECT boom') throw new Error('boom')
      return { rows: [] }
    },
  }
  await assert.rejects(mysqlProbeExecutor(client)('SELECT boom', 1000), /boom/)
  assert.equal(queries.at(-1), 'SET SESSION max_execution_time = 7000')
})

describe('beforeDataChanges', () => {
  const probe = '-- pikku:check-probe {"table":"item","sql":"SELECT 1"}\n'
  const alter = 'ALTER TABLE item ADD CONSTRAINT c CHECK (qty >= 1);'

  test('keeps everything when nothing changes data', () => {
    const sql = `${probe}${alter}\nCREATE TABLE t (a int REFERENCES item ON DELETE CASCADE ON UPDATE CASCADE);`
    assert.equal(beforeDataChanges(sql), sql)
  })

  test('stops at a statement that starts a line', () => {
    assert.equal(
      beforeDataChanges(
        `SELECT 1;\nUPDATE item SET qty = 1;\n${probe}${alter}`
      ),
      'SELECT 1;\n'
    )
  })

  test('stops at a data-changing CTE (WITH ... UPDATE/DELETE/INSERT)', () => {
    for (const body of [
      'WITH fixed AS (UPDATE item SET qty = 1 WHERE qty < 1 RETURNING *) SELECT count(*) FROM fixed;',
      'WITH gone AS (DELETE FROM item WHERE qty < 1 RETURNING *) SELECT 1;',
      'WITH n AS (INSERT INTO item (qty) VALUES (1) RETURNING *) SELECT 1;',
      'WITH src AS (SELECT 1 AS q) UPDATE item SET qty = src.q FROM src;',
    ]) {
      assert.equal(
        beforeDataChanges(`SELECT 1;\n${body}\n${probe}${alter}`),
        'SELECT 1;\n',
        body
      )
    }
  })

  test('a plain WITH ... SELECT is not a data change', () => {
    const sql = `WITH s AS (SELECT qty FROM item) SELECT * FROM s FOR UPDATE;\n${probe}${alter}`
    assert.equal(beforeDataChanges(sql), sql)
  })

  test('stops at a data change that follows another statement on the same line', () => {
    assert.equal(
      beforeDataChanges(`SELECT 1; UPDATE item SET qty = 1;\n${probe}${alter}`),
      'SELECT 1; '
    )
  })

  test('words in strings, comments and quoted names are not data changes', () => {
    const sql = `-- update everything later\nSELECT 'delete me; insert you', "update" FROM t;\n/* DELETE FROM x; */\n${probe}${alter}`
    assert.equal(beforeDataChanges(sql), sql)
  })

  test('a dollar-quoted body does not hide or invent statements', () => {
    const sql = `CREATE FUNCTION f() RETURNS void AS $$ BEGIN UPDATE item SET qty = 1; END $$ LANGUAGE plpgsql;\n${probe}${alter}`
    assert.equal(beforeDataChanges(sql), sql)
  })
})

test('the Postgres probe runs under a local statement_timeout', async () => {
  const { client, queries } = recorder()
  await postgresProbeExecutor(client)('SELECT 1', 1500)
  assert.deepEqual(queries, [
    'BEGIN',
    'SET LOCAL statement_timeout = 1500',
    'SELECT 1',
    'ROLLBACK',
  ])
})
