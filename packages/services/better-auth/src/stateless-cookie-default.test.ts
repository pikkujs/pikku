import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import {
  applyStatelessCookieCacheDefault,
  markStatelessSessionInUse,
  resetStatelessSessionInUse,
  STATELESS_COOKIE_CACHE_MAX_AGE,
} from './stateless-cookie-default.js'

const instanceWith = (cookieCache: any, maxAge = 300) => ({
  options: { session: { cookieCache } },
  $context: Promise.resolve({
    authCookies: {
      sessionData: { attributes: { maxAge } },
      accountData: { attributes: { maxAge } },
    },
  }),
})

const sessionMaxAge = async (instance: any) =>
  (await instance.$context).authCookies.sessionData.attributes.maxAge

describe('applyStatelessCookieCacheDefault', () => {
  beforeEach(() => resetStatelessSessionInUse())

  test('gives an unset maxAge a day, so the cookie outlives the first five minutes', async () => {
    markStatelessSessionInUse()
    const instance = instanceWith({ enabled: true })
    await applyStatelessCookieCacheDefault(instance as any)
    assert.equal(await sessionMaxAge(instance), STATELESS_COOKIE_CACHE_MAX_AGE)
  })

  test('also lengthens the account cookie, minted from the same default', async () => {
    markStatelessSessionInUse()
    const instance = instanceWith({ enabled: true })
    await applyStatelessCookieCacheDefault(instance as any)
    const ctx = await instance.$context
    assert.equal(
      ctx.authCookies.accountData.attributes.maxAge,
      STATELESS_COOKIE_CACHE_MAX_AGE
    )
  })

  test('inserts, never upserts: an explicit maxAge is left alone', async () => {
    markStatelessSessionInUse()
    const instance = instanceWith({ enabled: true, maxAge: 60 }, 60)
    await applyStatelessCookieCacheDefault(instance as any)
    assert.equal(await sessionMaxAge(instance), 60)
  })

  test('an explicit 300 is a choice, not the default, and survives', async () => {
    markStatelessSessionInUse()
    const instance = instanceWith({ enabled: true, maxAge: 300 })
    await applyStatelessCookieCacheDefault(instance as any)
    assert.equal(await sessionMaxAge(instance), 300)
  })

  test('leaves a stateful app alone — there the short cache is the correct trade', async () => {
    const instance = instanceWith({ enabled: true })
    await applyStatelessCookieCacheDefault(instance as any)
    assert.equal(await sessionMaxAge(instance), 300)
  })

  test('does nothing when the cookie cache is off or absent', async () => {
    markStatelessSessionInUse()
    for (const cookieCache of [undefined, { enabled: false }]) {
      const instance = instanceWith(cookieCache)
      await applyStatelessCookieCacheDefault(instance as any)
      assert.equal(await sessionMaxAge(instance), 300)
    }
  })

  test('reports rather than throws when the context is not the shape expected', async () => {
    markStatelessSessionInUse()
    const errors: string[] = []
    const instance = {
      options: { session: { cookieCache: { enabled: true } } },
      $context: Promise.resolve({ authCookies: {} }),
    }
    await applyStatelessCookieCacheDefault(
      instance as any,
      {
        error: (message: string) => errors.push(message),
      } as any
    )
    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /session\.cookieCache\.maxAge/)
  })

  test('reports rather than throws when the context rejects', async () => {
    markStatelessSessionInUse()
    const errors: string[] = []
    const instance = {
      options: { session: { cookieCache: { enabled: true } } },
      $context: Promise.reject(new Error('boom')),
    }
    await applyStatelessCookieCacheDefault(
      instance as any,
      {
        error: (message: string) => errors.push(message),
      } as any
    )
    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /boom/)
  })
})

/*
 * The fakes above say what the default DOES; this says the thing it does it to is
 * still there. It reaches into better-auth's resolved context, which is internal —
 * if a future version moves `authCookies.sessionData.attributes.maxAge`, or stops
 * defaulting it to 300, this fails and the guard in the implementation starts
 * logging instead of silently doing nothing.
 */
describe('applyStatelessCookieCacheDefault against a real betterAuth instance', () => {
  const realAuth = (cookieCache: any) =>
    betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'test-secret-at-least-32-characters-long!',
      database: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
      }),
      emailAndPassword: { enabled: true },
      session: { cookieCache },
    })

  test('better-auth still resolves an unset maxAge to 300, and it is still reachable', async () => {
    resetStatelessSessionInUse()
    markStatelessSessionInUse()
    const auth = realAuth({ enabled: true })

    const before = (await (auth as any).$context).authCookies.sessionData
      .attributes
    assert.equal(
      before.maxAge,
      300,
      'better-auth changed its cookie-cache default'
    )

    await applyStatelessCookieCacheDefault(auth as any)

    const after = (await (auth as any).$context).authCookies.sessionData
      .attributes
    assert.equal(after.maxAge, STATELESS_COOKIE_CACHE_MAX_AGE)
  })

  test('an explicitly configured maxAge reaches the cookie untouched', async () => {
    resetStatelessSessionInUse()
    markStatelessSessionInUse()
    const auth = realAuth({ enabled: true, maxAge: 90 })

    await applyStatelessCookieCacheDefault(auth as any)

    const attributes = (await (auth as any).$context).authCookies.sessionData
      .attributes
    assert.equal(attributes.maxAge, 90)
  })
})
