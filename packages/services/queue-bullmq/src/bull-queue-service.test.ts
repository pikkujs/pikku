import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { mapPikkuJobToBull } from './bull-queue-service.js'

// Same contract as the pg-boss adapter: the workflow's resolved retry policy
// (attempts + backoff) must reach BullMQ. backoff mapping in particular was
// previously dropped, so a step's backoff silently never applied on Redis.
describe('mapPikkuJobToBull — retry mapping', () => {
  test('attempts passes through unchanged (BullMQ uses attempts directly)', () => {
    assert.equal(mapPikkuJobToBull({ attempts: 6 }).attempts, 6)
    assert.equal(mapPikkuJobToBull({ attempts: 1 }).attempts, 1)
  })

  test("string backoff 'exponential' → { type: 'exponential' }", () => {
    assert.deepEqual(
      mapPikkuJobToBull({ attempts: 6, backoff: 'exponential' }).backoff,
      {
        type: 'exponential',
      }
    )
  })

  test('object backoff → { type, delay } (delay stays in ms)', () => {
    assert.deepEqual(
      mapPikkuJobToBull({ attempts: 4, backoff: { type: 'fixed', delay: 250 } })
        .backoff,
      { type: 'fixed', delay: 250 }
    )
  })

  test('no backoff → backoff left unset', () => {
    assert.equal(mapPikkuJobToBull({ attempts: 6 }).backoff, undefined)
  })

  test('no options → empty job options', () => {
    assert.deepEqual(mapPikkuJobToBull(undefined), {})
  })
})
