import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import * as nodeHttpServer from './index.js'

describe('@pikku/node-http-server', () => {
  test('exports the node http runtime API', () => {
    assert.equal(typeof nodeHttpServer.PikkuNodeHTTPServer, 'function')
    assert.equal(typeof nodeHttpServer.incomingMessageToRequest, 'function')
    assert.equal(typeof nodeHttpServer.writeResponse, 'function')
  })
})
