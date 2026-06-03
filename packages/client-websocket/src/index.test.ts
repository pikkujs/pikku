import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CorePikkuRouteHandler, CorePikkuWebsocket } from './index.js'

describe('@pikku/websocket', () => {
  test('exports the public websocket client API', () => {
    assert.equal(typeof CorePikkuWebsocket, 'function')
    assert.equal(typeof CorePikkuRouteHandler, 'function')
  })
})
