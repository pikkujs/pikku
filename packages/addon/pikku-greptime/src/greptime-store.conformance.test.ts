/**
 * Core's conformance suite against a real GreptimeDB. Set GREPTIME_URL to a
 * running instance (the script `scripts/with-greptime.sh` starts one); without
 * it the suite is skipped, because a mock would prove nothing.
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
