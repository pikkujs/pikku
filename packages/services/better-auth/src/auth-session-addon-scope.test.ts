import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { betterAuthSession } from './auth-session.js'

/**
 * `betterAuthSession` is registered globally, and global middleware is
 * application-wide — so it also runs on dispatches contributed by an addon.
 * An addon builds its own singleton services and is deliberately not handed
 * the host application's better-auth instance, so `services.auth` is simply
 * not there. That is the normal state for an addon, not a fault: the
 * middleware has no session to resolve and must let the chain continue.
 *
 * Before this guard it called `services.auth()` regardless, and every addon
 * dispatch failed with `services.auth is not a function` — which reached the
 * caller as a failed tool call.
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
