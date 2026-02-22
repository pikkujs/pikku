import { test } from 'node:test'
import assert from 'node:assert'
import {
  pikkuAuth,
  pikkuPermission,
  pikkuMiddleware,
  pikkuPermissionFactory,
  pikkuMiddlewareFactory,
} from './index.js'

test('pikkuPermission returns the same function', async () => {
  const originalFn = async () => true
  const wrappedFn = pikkuPermission(originalFn)
  assert.strictEqual(wrappedFn, originalFn)
})

test('pikkuMiddleware returns the same function', async () => {
  const originalFn = async ({ logger }, wires, next) => next
  const wrappedFn = pikkuMiddleware(originalFn)
  assert.strictEqual(wrappedFn, originalFn)
})

test('pikkuPermissionFactory creates a factory function', async () => {
  const factory = pikkuPermissionFactory<{ role: string }>(({ role }) => {
    return pikkuPermission(async ({ logger }, data, { session }) => {
      return (session as any)?.role === role
    })
  })

  assert.strictEqual(typeof factory, 'function')
  assert.strictEqual(factory.length, 1) // input parameter

  // Call the factory to get a permission
  const permission = factory({ role: 'admin' })
  assert.strictEqual(typeof permission, 'function')
  assert.strictEqual(permission.length, 3) // services, data, session
})

test('pikkuMiddlewareFactory creates a factory function', async () => {
  const factory = pikkuMiddlewareFactory<{ message: string }>(({ message }) => {
    return pikkuMiddleware(async ({ logger }, wires, next) => {
      logger.info(message)
      await next()
    })
  })

  assert.strictEqual(typeof factory, 'function')
  assert.strictEqual(factory.length, 1) // input parameter

  // Call the factory to get middleware
  const middleware = factory({ message: 'test' })
  assert.strictEqual(typeof middleware, 'function')
  assert.strictEqual(middleware.length, 3) // services, wires, next
})

test('pikkuPermissionFactory returns the same factory', async () => {
  const originalFactory = () => pikkuPermission(async () => true)
  const wrappedFactory = pikkuPermissionFactory(originalFactory as any)
  assert.strictEqual(wrappedFactory, originalFactory)
})

test('pikkuMiddlewareFactory returns the same factory', async () => {
  const originalFactory = ({ message }) =>
    pikkuMiddleware(async ({ logger }, _wires, next) => {
      logger.info(message)
      await next()
    })
  const wrappedFactory = pikkuMiddlewareFactory(originalFactory)
  assert.strictEqual(wrappedFactory, originalFactory)
})

test('pikkuAuth returns a 3-arg wrapper function', async () => {
  const authFn = async (_services, session) => !!session
  const wrapped = pikkuAuth(authFn)
  assert.strictEqual(typeof wrapped, 'function')
  assert.strictEqual(wrapped.length, 3)
})

test('pikkuAuth wrapper extracts session from wire and calls auth function', async () => {
  let receivedSession = null
  const authFn = async (_services, session) => {
    receivedSession = session
    return session.role === 'admin'
  }
  const wrapped = pikkuAuth(authFn)
  const result = await wrapped({}, null, { session: { role: 'admin' } })
  assert.strictEqual(result, true)
  assert.deepStrictEqual(receivedSession, { role: 'admin' })
})

test('pikkuAuth wrapper returns false when no session', async () => {
  const authFn = async (_services, session) => !!session
  const wrapped = pikkuAuth(authFn)
  const result = await wrapped({}, null, { session: null })
  assert.strictEqual(result, false)
})

test('pikkuAuth config object syntax works', async () => {
  const authFn = async (_services, session) => !!session
  const wrapped = pikkuAuth({
    func: authFn,
    name: 'Is Authenticated',
    description: 'Checks if user has a session',
  })
  assert.strictEqual(typeof wrapped, 'function')
  assert.strictEqual(wrapped.length, 3)
  const result = await wrapped({}, null, { session: { id: '1' } })
  assert.strictEqual(result, true)
})
