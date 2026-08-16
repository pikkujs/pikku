import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeConsoleFunctions } from './serialize-console-functions.js'

const leaf = (name: string) => `#pikku/${name}`

test('serializeConsoleFunctions includes console HTTP route wiring', () => {
  const { functions } = serializeConsoleFunctions(leaf, '#agents', '/api')

  assert.match(functions, /wireHTTPRoutes\(\{/)
  assert.match(functions, /route: '\/workflow-run\/:runId\/stream'/)
  assert.match(functions, /wireAddon\(\{/)
})

test('serializeConsoleFunctions gates the console addon behind the admin scope', () => {
  const { functions } = serializeConsoleFunctions(leaf, '#agents', '/api')

  assert.match(functions, /wireAddon\(\{[^}]*scopes: \['admin'\][^}]*\}\)/)
  assert.ok(
    !functions.includes('addGlobalPermission'),
    'the gate is declared on the addon, not recommended in a comment'
  )
})

test('serializeConsoleFunctions describes every payload with a zod schema', () => {
  const { schemas, functions } = serializeConsoleFunctions(
    leaf,
    '#agents',
    '/api'
  )

  assert.match(schemas, /import \{ z \} from 'zod'/)
  assert.match(schemas, /export const SetVariable = z\.object\(\{/)
  assert.match(functions, /from '\.\/console\.schemas\.gen\.js'/)
  assert.match(functions, /input: SetVariable/)
  assert.ok(
    !functions.includes('pikkuFunc<'),
    'schemas and generics are mutually exclusive'
  )
})

test('serializeConsoleFunctions no longer generates the console secret RPCs', () => {
  const { schemas, functions } = serializeConsoleFunctions(
    leaf,
    '#agents',
    '/api'
  )

  for (const name of [
    'SetSecret',
    'pikkuConsoleSetSecret',
    'pikkuConsoleGetSecret',
    'pikkuConsoleHasSecret',
  ]) {
    assert.ok(
      !schemas.includes(name) && !functions.includes(name),
      `${name} was generated — the console administers secrets through the addon, not through generated functions`
    )
  }
})

test('serializeConsoleFunctions keeps the schemas module free of anything but zod', () => {
  const { schemas } = serializeConsoleFunctions(leaf, '#agents', '/api')

  assert.ok(
    !schemas.includes(leaf),
    'the inspector imports this module directly, so it must not reach for a path deploy codegen rewrites'
  )
  assert.ok(!schemas.includes('@pikku/core'))
})
