import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import * as uwsHandler from './index.js'

describe('@pikku/uws-handler', () => {
  test('exports the uws handler API', () => {
    assert.equal(typeof uwsHandler.pikkuHTTPHandler, 'function')
    assert.equal(typeof uwsHandler.pikkuWebsocketHandler, 'function')
  })
})
