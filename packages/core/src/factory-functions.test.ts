import { test } from 'node:test'
import assert from 'node:assert'
import { pikkuPermission, pikkuMiddleware } from './index.js'

test('pikkuPermission factory function', async () => {
  const permission = pikkuPermission(async ({ logger }, data, session) => {
    return true
  })

  assert.strictEqual(typeof permission, 'function')
  assert.strictEqual(permission.length, 3) // services, data, session
})

test('pikkuMiddleware factory function', async () => {
  const middleware = pikkuMiddleware(async ({ logger }, interactions, next) => {
    await next()
  })

  assert.strictEqual(typeof middleware, 'function')
  assert.strictEqual(middleware.length, 3) // services, interactions, next
})

test('pikkuPermission returns the same function', async () => {
  const originalFn = async ({ logger }, data, session) => true
  const wrappedFn = pikkuPermission(originalFn)

  assert.strictEqual(wrappedFn, originalFn)
})

test('pikkuMiddleware returns the same function', async () => {
  const originalFn = async ({ logger }, interactions, next) => {
    await next()
  }
  const wrappedFn = pikkuMiddleware(originalFn)

  assert.strictEqual(wrappedFn, originalFn)
})
