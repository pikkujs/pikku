import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { mapPikkuJobToPgBoss } from './pg-boss-queue-service.js'

// These guard the contract the workflow engine relies on: a step's resolved
// retry policy (attempts + backoff) must survive translation into pg-boss
// terms, so "workflow owns retries" actually reaches the queue.
describe('mapPikkuJobToPgBoss — retry mapping', () => {
  test('attempts → retryLimit (attempts - 1)', () => {
    // Default policy: 5 retries → 6 attempts → retryLimit 5.
    assert.equal(mapPikkuJobToPgBoss({ attempts: 6 }).retryLimit, 5)
  })

  test('attempts: 1 (retries: 0) → retryLimit 0 (pg-boss never re-runs it)', () => {
    assert.equal(mapPikkuJobToPgBoss({ attempts: 1 }).retryLimit, 0)
  })

  test("backoff 'exponential' → retryBackoff true", () => {
    assert.equal(
      mapPikkuJobToPgBoss({ attempts: 6, backoff: 'exponential' })
        .retryBackoff,
      true
    )
  })

  test('fixed backoff → retryBackoff false + retryDelay in seconds', () => {
    const opts = mapPikkuJobToPgBoss({
      attempts: 4,
      backoff: { type: 'fixed', delay: 5000 },
    })
    assert.equal(opts.retryBackoff, false)
    // pg-boss takes seconds; our delay is milliseconds.
    assert.equal(opts.retryDelay, 5)
  })

  test('exponential object backoff → retryBackoff true + retryDelay in seconds', () => {
    const opts = mapPikkuJobToPgBoss({
      attempts: 4,
      backoff: { type: 'exponential', delay: 2000 },
    })
    assert.equal(opts.retryBackoff, true)
    assert.equal(opts.retryDelay, 2)
  })

  test('no options → no retry fields set', () => {
    const opts = mapPikkuJobToPgBoss(undefined)
    assert.equal(opts.retryLimit, undefined)
    assert.equal(opts.retryBackoff, undefined)
  })
})
