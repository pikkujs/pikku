import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pikku } from './http.js'

test('pikku() returns fetch and rpc instances pointed at the server url', () => {
  const { fetch, rpc } = pikku({ serverUrl: 'http://localhost:7103' })
  assert.ok(fetch)
  assert.ok(rpc)
})
