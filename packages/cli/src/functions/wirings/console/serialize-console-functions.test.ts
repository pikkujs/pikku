import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeConsoleFunctions } from './serialize-console-functions.js'

test('serializeConsoleFunctions includes console HTTP route wiring', () => {
  const { functions } = serializeConsoleFunctions('#pikku', '#agents', '/api')

  assert.match(functions, /wireHTTPRoutes\(\{/)
  assert.match(functions, /route: '\/workflow-run\/:runId\/stream'/)
  assert.match(functions, /wireAddon\(\{/)
})

test('serializeConsoleFunctions gates the console addon behind the admin scope', () => {
  const { functions } = serializeConsoleFunctions('#pikku', '#agents', '/api')

  assert.match(functions, /wireAddon\(\{[^}]*scopes: \['admin'\][^}]*\}\)/)
  assert.ok(
    !functions.includes('addGlobalPermission'),
    'the gate is declared on the addon, not recommended in a comment'
  )
})

test('every secret/variable broker function carries its own admin scope gate', () => {
  const { functions } = serializeConsoleFunctions('#pikku', '#agents', '/api')

  // wireAddon({ scopes: ['admin'] }) only governs functions whose packageName
  // is the addon. These are emitted into the app's own scaffold, so the addon
  // gate does not reach them — each must declare the scope itself, or any
  // authenticated user can read and overwrite every secret via POST /rpc.
  for (const fn of [
    'pikkuConsoleGetSecret',
    'pikkuConsoleSetSecret',
    'pikkuConsoleHasSecret',
    'pikkuConsoleGetVariable',
    'pikkuConsoleSetVariable',
  ]) {
    const start = functions.indexOf(`export const ${fn} = pikkuFunc({`)
    assert.notEqual(start, -1, `${fn} should be emitted`)
    const body = functions.slice(start, functions.indexOf('})', start))
    assert.match(
      body,
      /scopes: \['admin'\]/,
      `${fn} must declare scopes: ['admin']`
    )
  }
})

test('serializeConsoleFunctions describes every payload with a zod schema', () => {
  const { schemas, functions } = serializeConsoleFunctions(
    '#pikku',
    '#agents',
    '/api'
  )

  assert.match(schemas, /import \{ z \} from 'zod'/)
  assert.match(schemas, /export const SetSecret = z\.object\(\{/)
  assert.match(functions, /from '\.\/console\.schemas\.gen\.js'/)
  assert.match(functions, /input: SetSecret/)
  assert.ok(
    !functions.includes('pikkuFunc<'),
    'schemas and generics are mutually exclusive'
  )
})

test('serializeConsoleFunctions keeps the schemas module free of anything but zod', () => {
  const { schemas } = serializeConsoleFunctions('#pikku', '#agents', '/api')

  assert.ok(
    !schemas.includes('#pikku'),
    'the inspector imports this module directly, so it must not reach for a path deploy codegen rewrites'
  )
  assert.ok(!schemas.includes('@pikku/core'))
})
