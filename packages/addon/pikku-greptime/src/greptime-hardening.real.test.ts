/**
 * Write-path and schema hardening against a real GreptimeDB. Set GREPTIME_URL
 * (see the header of greptime-store.conformance.test.ts); skipped without it.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  GreptimeTelemetryStore,
  TelemetryQueryError,
} from './greptime-store.js'

const url = process.env.GREPTIME_URL

const sqlOf = async (statement: string, db = 'public') => {
  const response = await fetch(`${url}/v1/sql?db=${db}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ sql: statement }),
  })
  return (await response.json()) as any
}
const fresh = async (prefix: string, extra = {}) => {
  const database = `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`
  const store = new GreptimeTelemetryStore({
    url: url!,
    database,
    schemaTtlMs: 0,
    timeoutMs: 30_000,
    ...extra,
  })
  await store.ensureDatabase()
  return { store, database }
}
const now = Date.now()

if (!url) {
  console.log(
    'GREPTIME_URL is not set: skipping the GreptimeDB hardening suite'
  )
} else {
  describe('hardening against a real GreptimeDB', { timeout: 120_000 }, () => {
    test('a metric write cannot appear in another project, and the spoof is refused', async () => {
      const { store } = await fresh('hard_spoof')
      const victim = { project: 'victim', stage: 'prod' }
      const attacker = { project: 'attacker', stage: 'prod' }
      await store.appendMetrics(victim, [
        { name: 'req.count', at: now, value: 1 },
      ])
      await assert.rejects(
        store.appendMetrics(attacker, [
          {
            name: 'req.count',
            at: now + 1,
            value: 999,
            attributes: { 'pikku.project': 'victim' },
          },
        ]),
        TypeError
      )
      await store.appendMetrics(attacker, [
        {
          name: 'req.count',
          at: now + 2,
          value: 2,
          attributes: { region: 'eu' },
        },
      ])
      const seen = await store.metrics(victim, { since: now - 1000 })
      assert.deepEqual(
        seen.map((point) => point.value),
        [1]
      )
      const theirs = await store.metrics(attacker, { since: now - 1000 })
      assert.deepEqual(
        theirs.map((point) => point.value),
        [2]
      )
    })

    test('a metric named opentelemetry_traces is refused before any span, and traces still work', async () => {
      const { store } = await fresh('hard_name')
      const scope = { project: 'p', stage: 's' }
      await assert.rejects(
        store.appendMetrics(scope, [
          { name: 'opentelemetry_traces', at: now, value: 1 },
        ]),
        TypeError
      )
      await store.appendSpans(scope, [
        {
          traceId: 'a'.repeat(32),
          spanId: 'b'.repeat(16),
          name: 'GET /x',
          kind: 'server',
          startAt: now,
          endAt: now + 5,
          durationMs: 5,
          status: 'ok',
          attributes: { 'pikku.wire.type': 'http' },
        },
      ])
      assert.equal((await store.trace(scope, 'a'.repeat(32))).length, 1)
    })

    test('the tombstone table exists after ensureDatabase, before the first delete', async () => {
      const { database } = await fresh('hard_tomb')
      const body = await sqlOf(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = '${database}'`
      )
      const names = body.output[0].records.rows.map((row: string[]) => row[0])
      assert.ok(names.includes('pikku_project_tombstones'), names.join())
    })

    test('a broken tombstone table fails reads loudly, not writes or retention', async () => {
      const database = `hard_broken_${Date.now().toString(36)}`
      await sqlOf(`CREATE DATABASE ${database}`)
      await sqlOf(
        `CREATE TABLE pikku_project_tombstones (note STRING, ts TIMESTAMP(3) TIME INDEX)`,
        database
      )
      const store = new GreptimeTelemetryStore({
        url: url!,
        database,
        schemaTtlMs: 0,
        timeoutMs: 30_000,
      })
      await store.ensureDatabase()
      const scope = { project: 'p', stage: 's' }
      await store.appendLogs(scope, [
        { at: now, severity: 'info', body: 'kept', source: 'app' },
      ])
      await assert.rejects(
        store.logs(scope, {}),
        (error: unknown) =>
          error instanceof TelemetryQueryError &&
          /pikku_project_tombstones cannot be read/.test(error.message)
      )
      await store.retain({ days: 14 })
      await store.compact()
      assert.ok((await store.diskBytes()) >= 0)
    })

    test('one bad trace id in a log batch does not lose the batch; uppercase hex is lowercased', async () => {
      const { store } = await fresh('hard_ids')
      const scope = { project: 'p', stage: 's' }
      await store.appendLogs(scope, [
        {
          at: now,
          severity: 'info',
          body: 'bad-trace',
          source: 'app',
          traceId: 'NOT-HEX-AT-ALL',
          spanId: 'c'.repeat(16),
        },
        {
          at: now + 1,
          severity: 'info',
          body: 'upper',
          source: 'app',
          traceId: 'ABCDEF0123456789ABCDEF0123456789',
          spanId: 'ABCDEF0123456789',
        },
        { at: now + 2, severity: 'info', body: 'plain', source: 'app' },
        {
          at: now + 3,
          severity: 'info',
          body: 'short-span',
          source: 'app',
          spanId: 'ff',
        },
      ])
      const logs = await store.logs(scope, {})
      const byBody = new Map(logs.map((record) => [record.body, record]))
      assert.equal(logs.length, 4)
      assert.equal(byBody.get('bad-trace')?.traceId, undefined)
      assert.equal(byBody.get('bad-trace')?.spanId, 'c'.repeat(16))
      assert.equal(
        byBody.get('upper')?.traceId,
        'abcdef0123456789abcdef0123456789'
      )
      assert.equal(byBody.get('upper')?.spanId, 'abcdef0123456789')
      assert.equal(byBody.get('short-span')?.spanId, undefined)
    })

    test('metrics across more tables than the concurrency keeps only the newest limit points', async () => {
      const { store } = await fresh('hard_fan')
      const scope = { project: 'p', stage: 's' }
      for (let i = 0; i < 9; i++) {
        await store.appendMetrics(scope, [
          { name: `fan.metric_${i}`, at: now + i, value: i },
        ])
      }
      const newest = await store.metrics(scope, { since: now - 1000, limit: 4 })
      assert.deepEqual(
        newest.map((point) => point.value),
        [5, 6, 7, 8]
      )
      const all = await store.metrics(scope, { since: now - 1000 })
      assert.equal(all.length, 9)
    })

    test('a database name is used as given, lowercase, in the DDL and the write header', async () => {
      const { store, database } = await fresh('hard_case')
      assert.equal(database, database.toLowerCase())
      const scope = { project: 'p', stage: 's' }
      await store.appendLogs(scope, [
        { at: now, severity: 'info', body: 'x', source: 'app' },
      ])
      assert.equal((await store.logs(scope, {})).length, 1)
    })
  })
}
