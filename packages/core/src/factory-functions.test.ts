import { test } from 'node:test'
import assert from 'node:assert'
import {
  pikkuPermission,
  pikkuMiddleware,
  pikkuPermissionFactory,
  pikkuMiddlewareFactory,
} from './index.js'

test('pikkuPermission factory function', async () => {
  const permission = pikkuPermission(async ({ logger }, data) => {
    return true
  })

  assert.strictEqual(typeof permission, 'function')
  assert.strictEqual(permission.length, 3) // services, data, session
})

test('pikkuMiddleware factory function', async () => {
  const middleware = pikkuMiddleware(async ({ logger }, wires, next) => {
    await next()
  })

  assert.strictEqual(typeof middleware, 'function')
  assert.strictEqual(middleware.length, 3) // services, wires, next
})

test('pikkuPermission returns the same function', async () => {
  const originalFn = async ({ logger }, data, session) => true
  const wrappedFn = pikkuPermission(originalFn)

  assert.strictEqual(wrappedFn, originalFn)
})

test('pikkuMiddleware returns the same function', async () => {
  const originalFn = async ({ logger }, wires, next) => {
    await next()
  }
  const wrappedFn = pikkuMiddleware(originalFn)

  assert.strictEqual(wrappedFn, originalFn)
})

test('pikkuPermissionFactory creates a factory function', async () => {
  const factory = pikkuPermissionFactory<{ role: string }>(({ role }) => {
    return pikkuPermission(async ({ logger }, data, session) => {
      return session?.role === role
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
  const originalFactory = ({ role }) =>
    pikkuPermission(async ({ logger }, data, session) => {
      return session?.role === role
    })
  const wrappedFactory = pikkuPermissionFactory(originalFactory)

  assert.strictEqual(wrappedFactory, originalFactory)
})

test('pikkuMiddlewareFactory returns the same factory', async () => {
  const originalFactory = ({ message }) =>
    pikkuMiddleware(async ({ logger }, wires, next) => {
      logger.info(message)
      await next()
    })
  const wrappedFactory = pikkuMiddlewareFactory(originalFactory)

  assert.strictEqual(wrappedFactory, originalFactory)
})
