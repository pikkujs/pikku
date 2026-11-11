import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryTelemetryStore } from './memory-telemetry-store.js'
import { conformance } from './conformance.js'
import type { TelemetryStore } from '../telemetry-store.types.js'

// The write half through the store's own append methods.
conformance(new MemoryTelemetryStore())

// A read-only store, seeded through the ingest callback: the path a cloud
// store takes, where ingest is not the store's to own.
const backing = new MemoryTelemetryStore()
const readOnly: TelemetryStore = {
  logs: (s, q) => backing.logs(s, q),
  logFacets: (s, q) => backing.logFacets(s, q),
  failures: (s, q) => backing.failures(s, q),
  metrics: (s, q) => backing.metrics(s, q),
  metricsSummary: (s, q) => backing.metricsSummary(s, q),
  trace: (s, id) => backing.trace(s, id),
  queueJobs: (s, q) => backing.queueJobs(s, q),
  tail: (s, c, q) => backing.tail(s, c, q),
}
conformance(readOnly, {
  ingest: async (scope, data) => {
    await backing.appendLogs(scope, data.logs ?? [])
    await backing.appendSpans(scope, data.spans ?? [])
    await backing.appendMetrics(scope, data.metrics ?? [])
  },
})

describe('MemoryTelemetryStore', () => {
  test('rejects a tail cursor it did not return', async () => {
    const store = new MemoryTelemetryStore()
    await assert.rejects(
      store.tail({ project: 'p', stage: 's' }, 'garbage', {}),
      RangeError
    )
  })
})
