import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { PikkuUWSServer } from './index.js'

describe('@pikku/uws', () => {
  test('exports the uws server API', () => {
    assert.equal(typeof PikkuUWSServer, 'function')
  })
})
