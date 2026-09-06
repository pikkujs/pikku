import assert from 'node:assert/strict'
import test from 'node:test'
import { mapPikkuWorkerToNats } from './nats-queue-worker.js'

test('parallelism maps to max_ack_pending, never to a batch size', () => {
  const config = mapPikkuWorkerToNats({ batchSize: 25 })
  assert.equal(config.max_ack_pending, 25)
  // The whole point: nothing here may produce a config that hands several
  // messages to one handler and waits for all of them. That is the shape that
  // caused cross-tenant head-of-line blocking on pg-boss.
  assert.ok(!('batch' in config))
  assert.ok(!('max_batch' in config))
})

test('defaults to 10 concurrent when no batchSize is given', () => {
  assert.equal(mapPikkuWorkerToNats().max_ack_pending, 10)
  assert.equal(mapPikkuWorkerToNats({}).max_ack_pending, 10)
})

test('lockDuration converts from ms to ns for ack_wait', () => {
  assert.equal(mapPikkuWorkerToNats({ lockDuration: 45_000 }).ack_wait, 45_000_000_000)
})

test('explicit ack policy is always set', () => {
  // Anything else would ack on delivery and silently drop failures.
  assert.equal(mapPikkuWorkerToNats().ack_policy, 'explicit')
})

test('ack_wait defaults to pg-boss parity (900s), never the 30s server default', () => {
  // Regression: leaving ack_wait unset silently shortened the abandonment
  // timeout from pg-boss's 900s expire_seconds to JetStream's 30s default, so
  // any job running longer than 30s was redelivered while still running and
  // executed twice. Observed live: the workflow orchestrator hitting
  // delivered=7 for two messages.
  const config = mapPikkuWorkerToNats()
  assert.equal(config.ack_wait, 900_000 * 1_000_000)

  const explicit = mapPikkuWorkerToNats({ lockDuration: 5_000 })
  assert.equal(explicit.ack_wait, 5_000 * 1_000_000, 'an explicit lockDuration still wins')
})
