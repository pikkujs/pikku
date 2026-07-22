import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeConsoleFunctions } from './serialize-console-functions.js'

test('serializeConsoleFunctions includes console HTTP route wiring', () => {
  const { functions } = serializeConsoleFunctions('#pikku', '#agents', '/api')

  assert.match(functions, /wireHTTPRoutes\(\{/)
  assert.match(functions, /route: '\/workflow-run\/:runId\/stream'/)
  assert.match(functions, /wireAddon\(\{/)
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
