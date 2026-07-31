import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { createAuthHandler } from './auth-handler.js'
import {
  CROSS_SITE_COOKIE_HEADER,
  CROSS_SITE_SET_COOKIE_HEADER,
  decodeSetCookies,
  encodeSetCookies,
  mergeRelayedCookies,
  toCrossSite,
} from './cross-site-cookies.js'

const FLAG = 'AUTH_COOKIE_CROSS_SITE'

const withFlag = (value: string | undefined) => {
  if (value === undefined) delete process.env[FLAG]
  else process.env[FLAG] = value
}

/** Minimal better-auth double: records the request, replies with two cookies. */
function createFakeAuth() {
  const seen: Request[] = []
  const auth = {
    options: { basePath: '/api/auth' },
    handler: async (request: Request) => {
      seen.push(request)
      const headers = new Headers()
      headers.append(
        'set-cookie',
        '__Secure-better-auth.session_token=tok; Path=/; HttpOnly; Secure; SameSite=Lax'
      )
      headers.append(
        'set-cookie',
        '__Secure-better-auth.session_data=blob; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Wed, 09 Jun 2027 10:18:14 GMT'
      )
      return new Response('{}', { status: 200, headers })
    },
    api: {},
  }
  return { auth, seen }
}

function fakeHttpRequest(headers: Record<string, string>) {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    headers: () => headers,
    path: () => '/api/auth/sign-in/actor',
    query: () => ({}),
    method: () => 'POST',
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => ({}),
  }
}

async function runHandler(headers: Record<string, string> = {}) {
  const { auth, seen } = createFakeAuth()
  const { func } = createAuthHandler()
  const services: any = {
    logger: { info() {}, warn() {}, error() {} },
    auth: async () => auth,
  }
  const response = (await func(
    services,
    {},
    { http: { request: fakeHttpRequest({ host: 'app.dev', ...headers }) } } as any
  )) as Response
  return { response, seen }
}

describe('cross-site cookies', () => {
  afterEach(() => withFlag(undefined))

  test('toCrossSite replaces SameSite and adds Secure/Partitioned once', () => {
    const rewritten = toCrossSite('a=b; Path=/; HttpOnly; SameSite=Lax')
    assert.equal(
      rewritten,
      'a=b; Path=/; HttpOnly; SameSite=None; Secure; Partitioned'
    )
    // Re-running never accumulates duplicates (attribute order may shift, the
    // set may not) — a browser given two SameSite attributes drops the cookie.
    const again = toCrossSite(rewritten)
    for (const attribute of [/SameSite=None/g, /Secure/g, /Partitioned/g]) {
      assert.equal(again.match(attribute)?.length, 1, again)
    }
    // An attribute that is already there is left where it is, not duplicated.
    assert.equal(
      toCrossSite('a=b; Secure; SameSite=Lax'),
      'a=b; Secure; SameSite=None; Partitioned'
    )
  })

  test('set-cookie encoding survives the commas in an Expires attribute', () => {
    const cookies = [
      'a=b; Expires=Wed, 09 Jun 2027 10:18:14 GMT',
      'c=d; Path=/',
    ]
    assert.deepEqual(decodeSetCookies(encodeSetCookies(cookies)), cookies)
  })

  test('relayed cookies are ignored unless the runtime opts in', () => {
    const headers = new Headers({ [CROSS_SITE_COOKIE_HEADER]: 'a=relayed' })
    assert.equal(mergeRelayedCookies(headers).get('cookie'), null)
  })

  test('relayed cookies are merged in when the runtime opts in', () => {
    withFlag('true')
    const headers = new Headers({ [CROSS_SITE_COOKIE_HEADER]: 'a=relayed' })
    assert.equal(mergeRelayedCookies(headers).get('cookie'), 'a=relayed')
  })

  test('a real cookie always wins over the relayed copy of the same name', () => {
    withFlag('1')
    const headers = new Headers({
      cookie: 'a=real; b=real',
      [CROSS_SITE_COOKIE_HEADER]: 'a=stale; c=relayed',
    })
    assert.equal(
      mergeRelayedCookies(headers).get('cookie'),
      'a=real; b=real; c=relayed'
    )
  })

  test('the handler echoes the rewritten cookies for the client to relay', async () => {
    withFlag('true')
    const { response } = await runHandler()
    const echoed = decodeSetCookies(
      response.headers.get(CROSS_SITE_SET_COOKIE_HEADER)!
    )
    assert.equal(echoed.length, 2)
    for (const cookie of echoed) {
      assert.match(cookie, /;\s*SameSite=None\b/)
      assert.match(cookie, /;\s*Secure\b/)
      assert.match(cookie, /;\s*Partitioned\b/)
      assert.doesNotMatch(cookie, /SameSite=Lax/)
    }
    // The echo mirrors what actually went out — not a separately built copy.
    assert.deepEqual(response.headers.getSetCookie(), echoed)
  })

  test('the handler stays cookie-only when the runtime has not opted in', async () => {
    const { response } = await runHandler()
    assert.equal(response.headers.get(CROSS_SITE_SET_COOKIE_HEADER), null)
    assert.match(response.headers.getSetCookie()[0]!, /SameSite=Lax/)
  })

  test('better-auth sees the relayed cookies as ordinary cookies', async () => {
    withFlag('true')
    const { seen } = await runHandler({
      [CROSS_SITE_COOKIE_HEADER]: '__Secure-better-auth.session_token=tok',
    })
    assert.equal(
      seen[0]!.headers.get('cookie'),
      '__Secure-better-auth.session_token=tok'
    )
  })
})
