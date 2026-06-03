import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CorePikkuFetch, corePikkuFetch } from './index.js'

describe('@pikku/fetch', () => {
  test('exports the public fetch client API', () => {
    assert.equal(typeof CorePikkuFetch, 'function')
    assert.equal(typeof corePikkuFetch, 'function')
  })
})
