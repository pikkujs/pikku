/**
 * Core's conformance suite against a real GreptimeDB. Set GREPTIME_URL to a
 * running GreptimeDB v1.3.0 with OTLP on, then run this package's tests, e.g.
 *
 *   greptime standalone start -c config.toml --data-home /tmp/greptime-data
 *   GREPTIME_URL=http://127.0.0.1:4000 bun test src/greptime-store.conformance.test.ts
 *
 * (config.toml: `[http] addr = "127.0.0.1:4000"`, `[otlp] enable = true`,
 * mysql and postgres off; `verifiers/addon-greptime/test-greptime.ts` writes a
 * complete one.) Without GREPTIME_URL the suite is skipped, because a mock
 * would prove nothing.
 */
import { conformance } from '@pikku/core/telemetry-store/testing'
import { GreptimeTelemetryStore } from './greptime-store.js'

const url = process.env.GREPTIME_URL

if (url) {
  const store = new GreptimeTelemetryStore({
    url,
    database: process.env.GREPTIME_DB ?? 'pikku_conformance',
    schemaTtlMs: 0,
    timeoutMs: 30_000,
  })
  await store.ensureDatabase()
  conformance(store)
} else {
  console.log(
    'GREPTIME_URL is not set: skipping the GreptimeDB conformance suite'
  )
}
