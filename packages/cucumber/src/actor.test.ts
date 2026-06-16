import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Actor } from './actor.js'

const realFetch = globalThis.fetch

type Recorded = { url: string; headers: Record<string, string> }

/**
 * Stub global fetch with a tiny cookie-issuing server: it records the request
 * headers it received and replies with the Set-Cookie headers it was told to.
 */
function stubFetch(setCookies: string[][]): { calls: Recorded[] } {
  const calls: Recorded[] = []
  let call = 0
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((v, k) => {
      headers[k] = v
    })
    calls.push({
      url: typeof input === 'string' ? input : input.url,
      headers,
    })
    const cookies = setCookies[call++] ?? []
    return {
      status: 200,
      headers: { getSetCookie: () => cookies },
      json: async () => ({}),
    } as unknown as Response
  }) as typeof fetch
  return { calls }
}

describe('Actor cookie jar', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test('captures Set-Cookie and replays it on the next request', async () => {
    const { calls } = stubFetch([
      ['better-auth.session_token=abc123; Path=/; HttpOnly'],
      [],
    ])
    const actor = new Actor('user', {}, 'http://localhost:4077')

    await actor.cookieFetch('http://localhost:4077/sign-in')
    assert.equal(actor.cookieHeader, 'better-auth.session_token=abc123')

    await actor.cookieFetch('http://localhost:4077/get-session')
    assert.equal(
      calls[1]?.headers['cookie'],
      'better-auth.session_token=abc123'
    )
  })

  test('stamps the Origin header from the actor baseUrl', async () => {
    const { calls } = stubFetch([[]])
    const actor = new Actor('user', {}, 'http://localhost:4077')
    await actor.cookieFetch('http://localhost:4077/sign-up')
    assert.equal(calls[0]?.headers['origin'], 'http://localhost:4077')
  })

  test('an empty-value Set-Cookie (Max-Age=0) clears the cookie', async () => {
    const { calls } = stubFetch([
      ['better-auth.session_token=abc123'],
      ['better-auth.session_token=; Max-Age=0'],
      [],
    ])
    const actor = new Actor('user', {}, 'http://localhost:4077')
    await actor.cookieFetch('http://localhost:4077/sign-in')
    await actor.cookieFetch('http://localhost:4077/sign-out')
    assert.equal(actor.cookieHeader, '')

    await actor.cookieFetch('http://localhost:4077/get-session')
    assert.equal(calls[2]?.headers['cookie'], undefined)
  })

  test('clearCookies empties the jar', async () => {
    stubFetch([['better-auth.session_token=abc123']])
    const actor = new Actor('user', {}, 'http://localhost:4077')
    await actor.cookieFetch('http://localhost:4077/sign-in')
    assert.notEqual(actor.cookieHeader, '')
    actor.clearCookies()
    assert.equal(actor.cookieHeader, '')
  })
})
