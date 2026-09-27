import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { betterAuthSession } from './auth-session.js'

/**
 * See `a-session-middleware-stands-down-where-it-cannot-authenticate.md`.
 */
describe('betterAuthSession in a scope without an auth service', () => {
  const wireWithRequest = () => ({
    http: {
      request: {
        header: () => undefined,
        headers: () => ({}),
      },
    },
    setSession: () => {
      assert.fail('no session should be set without an auth service')
    },
    session: undefined,
    getSession: () => undefined,
  })

  test('continues the chain instead of throwing', async () => {
    let nextCalled = false
    const services: any = { logger: { error() {}, warn() {}, info() {} } }

    await betterAuthSession()(services, wireWithRequest() as any, async () => {
      nextCalled = true
    })

    assert.equal(nextCalled, true)
  })

  test('still runs when an auth service is present', async () => {
    let authCalled = false
    let nextCalled = false
    const services: any = {
      logger: { error() {}, warn() {}, info() {} },
      auth: async () => {
        authCalled = true
        return { api: { getSession: async () => null } }
      },
    }

    await betterAuthSession()(services, wireWithRequest() as any, async () => {
      nextCalled = true
    })

    assert.equal(authCalled, true)
    assert.equal(nextCalled, true)
  })
})
