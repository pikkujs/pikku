import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import pikkuFastifyPlugin, {
  FastifyPikkuHTTPRequest,
  FastifyPikkuHTTPResponse,
} from './index.js'

describe('@pikku/fastify-plugin', () => {
  test('exports the fastify plugin API', () => {
    assert.equal(typeof pikkuFastifyPlugin, 'function')
    assert.equal(typeof FastifyPikkuHTTPRequest, 'function')
    assert.equal(typeof FastifyPikkuHTTPResponse, 'function')
  })
})
