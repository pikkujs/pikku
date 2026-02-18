import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { serializePublicRPC } from './serialize-public-rpc.js'

describe('serializePublicRPC', () => {
  test('adds pikku:public tags to generated public rpc routes', () => {
    const serialized = serializePublicRPC('#pikku')
    const matches = serialized.match(/tags:\s*\['pikku:public'\]/g)
    assert.equal(matches?.length, 2)
  })
})
