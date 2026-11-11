/**
 * Retention against a real GreptimeDB: a database whose TTL is one second,
 * rows written through the store, then a wait and a compaction, and the tables
 * are counted with plain SQL. Skipped without GREPTIME_URL.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { GreptimeTelemetryStore } from './greptime-store.js'
import { runRetention, startRetentionJob } from './retention.js'

const url = process.env.GREPTIME_URL

const count = async (database: string, table: string): Promise<number> => {
  const response = await fetch(`${url}/v1/sql?db=${database}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ sql: `SELECT count(*) FROM "${table}"` }),
  })
  const body: any = await response.json()
  return Number(body.output[0].records.rows[0][0])
}

describe('retention against a real GreptimeDB', { skip: !url }, () => {
  test(
    'a database with a 1s ttl holds nothing after a wait and a compaction',
    { timeout: 60_000 },
    async () => {
      const database = `pikku_ttl_${Date.now().toString(36)}`
      const store = new GreptimeTelemetryStore({
        url: url!,
        database,
        ttl: '1s',
        schemaTtlMs: 0,
        timeoutMs: 30_000,
      })
      const scope = { project: 'ttl', stage: 'production' }
      const now = Date.now()
      await store.appendLogs(scope, [
        { at: now, severity: 'info', body: 'short lived', source: 'app' },
      ])
      await store.appendSpans(scope, [
        {
          traceId: 'a'.repeat(32),
          spanId: '1'.padStart(16, '0'),
          name: 'fn',
          kind: 'server',
          startAt: now,
          endAt: now + 5,
          durationMs: 5,
          status: 'ok',
          attributes: { 'pikku.function.id': 'f' },
        },
      ])
      await store.appendMetrics(scope, [
        { at: now, name: 'pikku.ttl.gauge', value: 1 },
      ])
      assert.equal(await count(database, 'opentelemetry_logs'), 1)
      assert.equal(await count(database, 'opentelemetry_traces'), 1)
      assert.equal(await count(database, 'pikku_ttl_gauge'), 1)

      await new Promise((resolve) => setTimeout(resolve, 2500))
      await store.compact()

      assert.equal(await count(database, 'opentelemetry_logs'), 0)
      assert.equal(await count(database, 'opentelemetry_traces'), 0)
      assert.equal(await count(database, 'pikku_ttl_gauge'), 0)
      assert.deepEqual(await store.logs(scope, {}), [])
    }
  )

  test(
    'retain({days}) sets the ttl on every telemetry table and drops what is older',
    { timeout: 60_000 },
    async () => {
      const database = `pikku_ret_${Date.now().toString(36)}`
      const store = new GreptimeTelemetryStore({
        url: url!,
        database,
        schemaTtlMs: 0,
        timeoutMs: 30_000,
      })
      const scope = { project: 'ret', stage: 'production' }
      const now = Date.now()
      await store.appendLogs(scope, [
        {
          at: now - 40 * 86_400_000,
          severity: 'info',
          body: 'old',
          source: 'app',
        },
        { at: now - 1000, severity: 'info', body: 'new', source: 'app' },
      ])
      await store.appendMetrics(scope, [
        { at: now - 40 * 86_400_000, name: 'pikku.ret.gauge', value: 1 },
        { at: now - 1000, name: 'pikku.ret.gauge', value: 2 },
      ])
      await store.retain({ days: 14 })
      assert.deepEqual(
        (await store.logs(scope, {})).map((r) => r.body),
        ['new']
      )
      assert.equal(await count(database, 'pikku_ret_gauge'), 1)
      assert.ok((await store.diskBytes()) > 0)
    }
  )

  test(
    'over the disk cap a run keeps 3 days instead, and the job runs and stops',
    { timeout: 60_000 },
    async () => {
      const database = `pikku_cap_${Date.now().toString(36)}`
      const store = new GreptimeTelemetryStore({
        url: url!,
        database,
        schemaTtlMs: 0,
        timeoutMs: 30_000,
      })
      const scope = { project: 'cap', stage: 'production' }
      const now = Date.now()
      await store.appendLogs(scope, [
        {
          at: now - 5 * 86_400_000,
          severity: 'info',
          body: 'five days',
          source: 'app',
        },
        { at: now - 1000, severity: 'info', body: 'now', source: 'app' },
      ])
      await store.compact()
      const warnings: string[] = []
      const roomy = await runRetention(store, {
        days: 14,
        warn: (m) => warnings.push(m),
      })
      assert.equal(roomy.capped, false)
      assert.deepEqual(
        (await store.logs(scope, {})).map((r) => r.body),
        ['now', 'five days']
      )
      const capped = await runRetention(store, {
        days: 14,
        maxMb: 0.0001,
        warn: (m) => warnings.push(m),
      })
      assert.equal(capped.capped, true)
      assert.equal(capped.days, 3)
      assert.equal(warnings.length, 1)
      assert.deepEqual(
        (await store.logs(scope, {})).map((r) => r.body),
        ['now']
      )

      const outcomes: unknown[] = []
      const stop = startRetentionJob(store, {
        days: 14,
        firstRunMs: 10,
        intervalMs: 50,
        onRun: (outcome) => outcomes.push(outcome),
      })
      await new Promise((resolve) => setTimeout(resolve, 1500))
      stop()
      assert.ok(outcomes.length >= 2, `ran ${outcomes.length} times`)
      assert.ok(outcomes.every((o) => !(o instanceof Error)))
      // A run already under way when stop() was called still finishes.
      await new Promise((resolve) => setTimeout(resolve, 3000))
      const settled = outcomes.length
      await new Promise((resolve) => setTimeout(resolve, 1000))
      assert.equal(outcomes.length, settled, 'the job kept running after stop')
    }
  )
})
