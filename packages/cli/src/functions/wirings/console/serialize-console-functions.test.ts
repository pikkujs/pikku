import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeConsoleFunctions } from './serialize-console-functions.js'

test('serializeConsoleFunctions includes console HTTP route wiring', () => {
  const out = serializeConsoleFunctions('#pikku', '#agents', '/api')

  assert.match(out, /wireHTTPRoutes\(\{/)
  assert.match(out, /route: '\/workflow-run\/:runId\/stream'/)
  assert.match(out, /wireAddon\(\{/)
})
