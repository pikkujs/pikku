import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { PikkuFastifyServer } from './index.js'

describe('@pikku/fastify', () => {
  test('exports the fastify server API', () => {
    assert.equal(typeof PikkuFastifyServer, 'function')
  })
})
