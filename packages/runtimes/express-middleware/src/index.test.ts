import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import * as expressMiddleware from './index.js'

describe('@pikku/express-middleware', () => {
  test('exports the express middleware API', () => {
    assert.equal(typeof expressMiddleware.pikkuExpressMiddleware, 'function')
    assert.equal(typeof expressMiddleware.ExpressPikkuHTTPRequest, 'function')
    assert.equal(typeof expressMiddleware.ExpressPikkuHTTPResponse, 'function')
  })
})
