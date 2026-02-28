import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { serializePublicRPC } from './serialize-public-rpc.js'

describe('serializePublicRPC', () => {
  test('adds pikku:public tags to generated public rpc routes', () => {
    const serialized = serializePublicRPC('#pikku')
    const matches = serialized.match(/tags:\s*\['pikku:public'\]/g)
    assert.equal(matches?.length, 1)
  })

  test('defaults generated public rpc routes to auth enabled', () => {
    const serialized = serializePublicRPC('#pikku')
    assert.doesNotMatch(serialized, /auth:\s*false/)
    assert.match(serialized, /auth:\s*true/)
  })

  test('supports explicitly generating public unauthenticated rpc routes', () => {
    const serialized = serializePublicRPC('#pikku', false)
    assert.match(serialized, /auth:\s*false/)
  })
})
