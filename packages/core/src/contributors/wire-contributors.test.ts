import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuState } from '../pikku-state.js'
import { wireContributors } from './index.js'

describe('wireContributors', () => {
  test('is read at build time and registers nothing at runtime', () => {
    const before = [...pikkuState(null, 'addons', 'packages').keys()]
    assert.equal(
      wireContributors({
        package: '@pikku/queue-nats',
        contributors: ['nats'],
      }),
      undefined
    )
    assert.deepEqual([...pikkuState(null, 'addons', 'packages').keys()], before)
  })
})
