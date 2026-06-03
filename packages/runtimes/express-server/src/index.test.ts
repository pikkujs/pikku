import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { PikkuExpressServer } from './index.js'

describe('@pikku/express', () => {
  test('exports the express server API', () => {
    assert.equal(typeof PikkuExpressServer, 'function')
  })
})
