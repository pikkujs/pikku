import test from 'node:test'
import assert from 'node:assert/strict'

import { mysqlProbeExecutor, postgresProbeExecutor } from './check-probe.js'

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

test('the MySQL probe runs under max_execution_time, so the server cancels it, and puts the session back', async () => {
  const { client, queries } = recorder()
  const rows = await mysqlProbeExecutor(client)('SELECT 1', 30_000)
  assert.deepEqual(rows, [{ one: 1 }])
  assert.deepEqual(queries, [
    'SET SESSION max_execution_time = 30000',
    'SELECT 1',
    'SET SESSION max_execution_time = DEFAULT',
  ])
})

test('the MySQL probe restores the session when the scan fails', async () => {
  const queries: string[] = []
  const client = {
    query: async (sql: string) => {
      queries.push(sql)
      if (sql === 'SELECT 1') throw new Error('Query execution was interrupted')
      return { rows: [] }
    },
  }
  await assert.rejects(mysqlProbeExecutor(client)('SELECT 1', 5), /interrupted/)
  assert.equal(queries.at(-1), 'SET SESSION max_execution_time = DEFAULT')
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
