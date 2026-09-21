/**
 * Run: node --test packages/frontend/react/src/session-refresh.test.ts
 */
import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  refreshSessionCookie,
  resetSessionRefresh,
  startSessionRefresh,
  stopSessionRefresh,
} from './session-refresh.ts'

const API = 'http://localhost:5003/api'

const withFetch = async (
  impl: (url: string, init: RequestInit) => unknown,
  run: () => Promise<void>
) => {
  const original = globalThis.fetch
  globalThis.fetch = ((url: string, init: RequestInit) =>
    Promise.resolve(impl(url, init))) as unknown as typeof fetch
  try {
    await run()
  } finally {
    globalThis.fetch = original
  }
}

const ok = (body: unknown) => ({
  ok: true,
  json: () => Promise.resolve(body),
})

beforeEach(() => resetSessionRefresh())

/*
 * The flag is the whole reason this module exists. Without it /get-session sees
 * a valid cache and returns it without touching the cookie, because the branch
 * that would extend it in place is disabled whenever a database is configured.
 * A refresh that does not carry it is a no-op that looks like it worked.
 */
test('the refresh asks better-auth to skip the cache and re-read the database', async () => {
  let seen: { url: string; init: RequestInit } | undefined
  await withFetch(
    (url, init) => {
      seen = { url, init }
      return ok({ user: { id: 'u1' } })
    },
    async () => {
      assert.equal(await refreshSessionCookie(API), true)
    }
  )
  assert.equal(
    seen!.url,
    'http://localhost:5003/api/auth/get-session?disableCookieCache=true'
  )
  // The cookie must ride the request and come back on the response.
  assert.equal(seen!.init.credentials, 'include')
})

/* Better Auth answers a signed-out caller with 200 and a null body, so the
   status alone would read as success and the gate would never heal. */
test('a signed-out session is a 200 with no user, not an error status', async () => {
  await withFetch(
    () => ok(null),
    async () => {
      assert.equal(await refreshSessionCookie(API), false)
    }
  )
})

test('a network failure is false, never a throw', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (() =>
    Promise.reject(new Error('offline'))) as unknown as typeof fetch
  try {
    assert.equal(await refreshSessionCookie(API), false)
  } finally {
    globalThis.fetch = original
  }
})

test('a non-JSON body is false rather than an unhandled rejection', async () => {
  await withFetch(
    () => ({ ok: true, json: () => Promise.reject(new Error('not json')) }),
    async () => {
      assert.equal(await refreshSessionCookie(API), false)
    }
  )
})

/* The route gate and the timer can easily fire together on a woken tab. */
test('concurrent refreshes share one request', async () => {
  let calls = 0
  await withFetch(
    () => {
      calls++
      return ok({ user: { id: 'u1' } })
    },
    async () => {
      const [a, b] = await Promise.all([
        refreshSessionCookie(API),
        refreshSessionCookie(API),
      ])
      assert.equal(a, true)
      assert.equal(b, true)
    }
  )
  assert.equal(calls, 1)
})

test('startSessionRefresh is idempotent and stoppable', async () => {
  const intervals: unknown[] = []
  const listeners: string[] = []
  const originalWindow = (globalThis as any).window
  const originalDocument = (globalThis as any).document
  const originalSet = globalThis.setInterval
  const originalClear = globalThis.clearInterval

  ;(globalThis as any).window = globalThis
  ;(globalThis as any).document = {
    hidden: false,
    visibilityState: 'visible',
    addEventListener: (name: string) => listeners.push(name),
    removeEventListener: (name: string) => {
      listeners.splice(listeners.indexOf(name), 1)
    },
  }
  globalThis.setInterval = ((fn: () => void, ms: number) => {
    const handle = { fn, ms }
    intervals.push(handle)
    return handle as any
  }) as any
  globalThis.clearInterval = ((handle: unknown) => {
    intervals.splice(intervals.indexOf(handle), 1)
  }) as any

  try {
    startSessionRefresh({ apiUrl: API })
    startSessionRefresh({ apiUrl: API })
    assert.equal(intervals.length, 1, 'a second call must not add a timer')
    assert.deepEqual(listeners, ['visibilitychange'])

    stopSessionRefresh()
    assert.equal(intervals.length, 0)
    assert.deepEqual(listeners, [])
  } finally {
    globalThis.setInterval = originalSet
    globalThis.clearInterval = originalClear
    ;(globalThis as any).window = originalWindow
    ;(globalThis as any).document = originalDocument
  }
})
