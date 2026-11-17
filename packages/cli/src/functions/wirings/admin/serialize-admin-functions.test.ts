import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeAdminFunctions } from './serialize-admin-functions.js'

const leaf = (name: string) => `#pikku/${name}`

test('serializeAdminFunctions wires the admin addon and the workflow-run stream', () => {
  const out = serializeAdminFunctions(leaf, '/api')

  assert.match(out, /name: 'admin'/)
  assert.match(out, /package: '@pikku\/addon-admin'/)
  assert.match(out, /route: '\/workflow-run\/:runId\/stream'/)
  assert.match(out, /sse: true/)
  assert.match(out, /ref\('admin:streamWorkflowRun'\)/)
  assert.match(out, /basePath: '\/api'/)
})

// Addon scopes are required in addition to a function's own, so a scope on the
// addon would force the umbrella grant on every caller.
test('serializeAdminFunctions puts no scope on the addon and authenticates the stream', () => {
  const out = serializeAdminFunctions(leaf)

  assert.doesNotMatch(out, /wireAddon\(\{[^}]*scopes:/)
  assert.match(out, /auth: true/)
})

// The secret and credential functions read names an operator supplies at run
// time, which no static declaration covers. Without the exemptions core scopes
// the addon to what it declared (nothing), and every call is refused.
test('serializeAdminFunctions exempts the addon from secret and credential scoping with a reason', () => {
  const out = serializeAdminFunctions(leaf)
  const call = out.match(/wireAddon\(\{[\s\S]*?\n\}\)/)
  assert.ok(call)

  for (const field of ['globalSecrets', 'globalCredentials']) {
    const reason = call[0].match(new RegExp(`${field}:\\s*'([^']+)'`))
    assert.ok(reason, `${field} is set`)
    assert.ok(reason[1].length > 20, `${field} has a reason`)
  }
  assert.equal(call[0].includes('secretGrants'), false)
  assert.equal(call[0].includes('credentialGrants'), false)
})
