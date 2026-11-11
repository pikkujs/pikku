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
  assert.match(out, /globalCredentials:/)
})
