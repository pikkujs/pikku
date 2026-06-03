import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import * as wsRuntime from './index.js'

describe('@pikku/ws', () => {
  test('exports the websocket server API', () => {
    assert.equal(typeof wsRuntime.pikkuWebsocketHandler, 'function')
  })
})
