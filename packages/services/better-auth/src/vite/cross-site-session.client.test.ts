import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import {
  CROSS_SITE_COOKIE_HEADER,
  CROSS_SITE_SET_COOKIE_HEADER,
} from '../cross-site-cookies.js'
import {
  applySetCookies,
  installCrossSiteSession,
  serializeJar,
  writeJar,
} from './cross-site-session.client.js'

const g = globalThis as unknown as Record<string, unknown>
const saved = {
  window: g.window,
  localStorage: g.localStorage,
  fetch: g.fetch,
}

const storage = () => {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

beforeEach(() => {
  g.localStorage = storage()
  writeJar({})
})

afterEach(() => {
  g.window = saved.window
  g.localStorage = saved.localStorage
  g.fetch = saved.fetch
})

describe('the cookie jar', () => {
  test('keeps the cookies the server echoes and sends them back as a Cookie string', () => {
    applySetCookies(['a=1; Path=/; HttpOnly', 'b=2; Max-Age=3600'])
    assert.equal(serializeJar(), 'a=1; b=2')
  })

  test('a deletion (Max-Age=0) removes the cookie, which is what sign-out sends', () => {
    applySetCookies(['a=1'])
    applySetCookies(['a=; Max-Age=0'])
    assert.equal(serializeJar(), '')
  })

  test('an expired cookie is dropped the next time the jar is read', () => {
    writeJar({ old: { v: 'x', e: Date.now() - 1000 }, live: { v: 'y' } })
    assert.equal(serializeJar(), 'live=y')
  })
})

describe('installCrossSiteSession', () => {
  const install = (respond: (headers: Headers) => Response) => {
    const seen: Headers[] = []
    const base = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      seen.push(headers)
      return respond(headers)
    }) as typeof fetch
    const win = {
      location: { origin: 'http://app.test' },
      fetch: base,
    } as unknown as { fetch: typeof fetch & { __pikkuCrossSite?: true } }
    win.fetch.bind = () => base
    g.window = win
    installCrossSiteSession(() => 'http://api.test/api')
    return { win, seen }
  }

  test('relays the jar to the API origin and stores what the API sets', async () => {
    const { win, seen } = install(() => {
      const headers = new Headers()
      headers.set(
        CROSS_SITE_SET_COOKIE_HEADER,
        encodeURIComponent(JSON.stringify(['session=abc; Max-Age=60']))
      )
      return new Response('ok', { headers })
    })
    await win.fetch('http://api.test/api/auth/sign-in/email', {
      method: 'POST',
    })
    assert.equal(seen[0]!.get(CROSS_SITE_COOKIE_HEADER), null)
    await win.fetch('http://api.test/api/rpc/getSession')
    assert.equal(seen[1]!.get(CROSS_SITE_COOKIE_HEADER), 'session=abc')
  })

  test('never sends the jar to a third-party origin', async () => {
    const { win, seen } = install(() => new Response('ok'))
    applySetCookies(['session=abc'])
    await win.fetch('http://elsewhere.test/track')
    assert.equal(seen[0]!.get(CROSS_SITE_COOKIE_HEADER), null)
  })

  test('installing twice patches fetch once', () => {
    const { win } = install(() => new Response('ok'))
    const first = win.fetch
    installCrossSiteSession(() => 'http://api.test/api')
    assert.equal(win.fetch, first)
  })
})
