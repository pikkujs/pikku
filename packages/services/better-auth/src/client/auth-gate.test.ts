import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createAuthGate } from './auth-gate.js'

const signedOut = () =>
  Object.assign(new Error('Authentication required'), { status: 403 })

const setup = (
  fetches: Array<() => Promise<string>>,
  refreshResult = false
) => {
  const calls = { refresh: 0, start: 0 }
  const queue = [...fetches]
  const gate = createAuthGate({
    fetchSession: () => queue.shift()!(),
    refreshSessionCookie: async () => {
      calls.refresh++
      return refreshResult
    },
    startSessionRefresh: () => {
      calls.start++
    },
    redirect: (options) => ({ redirected: options.to }),
    loginPath: '/login',
    homePath: '/home',
  })
  return { gate, calls }
}

describe('requireAuthentication', () => {
  test('returns the session and starts the refresh when signed in', async () => {
    const { gate, calls } = setup([async () => 'session'])
    assert.deepEqual(await gate.requireAuthentication(), { session: 'session' })
    assert.equal(calls.start, 1)
  })

  test('redirects to the login path when signed out and the refresh finds nothing', async () => {
    const { gate, calls } = setup([async () => Promise.reject(signedOut())])
    await assert.rejects(
      gate.requireAuthentication(),
      (thrown) => (thrown as { redirected: string }).redirected === '/login'
    )
    assert.equal(calls.refresh, 1)
    assert.equal(calls.start, 0)
  })

  test('a stale cookie is rebuilt and the second read succeeds', async () => {
    const { gate, calls } = setup(
      [async () => Promise.reject(signedOut()), async () => 'fresh'],
      true
    )
    assert.deepEqual(await gate.requireAuthentication(), { session: 'fresh' })
    assert.equal(calls.start, 1)
  })

  test('a second refusal after a refresh is a real sign-out', async () => {
    const { gate } = setup(
      [
        async () => Promise.reject(signedOut()),
        async () => Promise.reject(signedOut()),
      ],
      true
    )
    await assert.rejects(
      gate.requireAuthentication(),
      (thrown) => (thrown as { redirected: string }).redirected === '/login'
    )
  })

  test('a failure that is not a sign-out is rethrown, not bounced to login', async () => {
    const boom = new Error('database is down')
    const { gate } = setup([async () => Promise.reject(boom)])
    await assert.rejects(
      gate.requireAuthentication(),
      (thrown) => thrown === boom
    )
  })
})

describe('redirectIfAuthenticated', () => {
  test('sends a signed-in visitor home', async () => {
    const { gate } = setup([async () => 'session'])
    await assert.rejects(
      gate.redirectIfAuthenticated(),
      (thrown) => (thrown as { redirected: string }).redirected === '/home'
    )
  })

  test('lets a signed-out visitor see the auth screen', async () => {
    const { gate } = setup([async () => Promise.reject(signedOut())])
    await gate.redirectIfAuthenticated()
  })
})
