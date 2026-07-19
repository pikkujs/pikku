import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { assertFetchableUrl, isPrivateHost, safeFetch } from './safe-fetch.js'

describe('isPrivateHost', () => {
  test('flags loopback, private ranges, and cloud metadata', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
      '[::1]',
      'fd00::1',
    ]) {
      assert.equal(isPrivateHost(host), true, `${host} should be private`)
    }
  })

  test('flags alias and encoded forms of internal hosts', () => {
    for (const host of [
      'localhost.', // trailing-dot FQDN
      'foo.localhost', // *.localhost resolves to loopback (RFC 6761)
      '::', // unspecified address
      '::ffff:127.0.0.1', // IPv4-mapped IPv6 (dotted)
      '::ffff:7f00:1', // IPv4-mapped IPv6 (hex, as URL normalizes it)
      '2130706433', // decimal-encoded 127.0.0.1
      '0x7f000001', // hex-encoded 127.0.0.1
      '0177.0.0.1', // octal first octet (127)
      '0x7f.0.0.1', // hex first octet (127)
      'fe80::1', // link-local
      'fea9::1', // link-local within fe80::/10
      'febf::1', // top of fe80::/10
    ]) {
      assert.equal(isPrivateHost(host), true, `${host} should be private`)
    }
  })

  test('allows public hosts', () => {
    for (const host of [
      'example.com',
      '8.8.8.8',
      '172.32.0.1',
      '11.0.0.1',
      '134744072', // decimal-encoded 8.8.8.8 — public
      '2001:db8::1', // documentation range — public
      'fec0::1', // deprecated site-local, outside fe80::/10 — treated public
    ]) {
      assert.equal(isPrivateHost(host), false, `${host} should be public`)
    }
  })
})

describe('assertFetchableUrl', () => {
  test('rejects non-HTTP(S) schemes', () => {
    assert.throws(() => assertFetchableUrl('file:///etc/passwd'), /non-HTTP/)
    assert.throws(() => assertFetchableUrl('ftp://example.com'), /non-HTTP/)
  })

  test('rejects private hosts by default', () => {
    assert.throws(
      () => assertFetchableUrl('http://169.254.169.254/latest/meta-data/'),
      /private\/internal host/
    )
  })

  test('honours an allowlist (and rejects hosts not on it)', () => {
    assert.doesNotThrow(() =>
      assertFetchableUrl('http://internal.svc/x', {
        allowedHosts: ['internal.svc'],
      })
    )
    assert.throws(
      () =>
        assertFetchableUrl('https://example.com', {
          allowedHosts: ['internal.svc'],
        }),
      /not in the allowlist/
    )
  })
})

describe('safeFetch', () => {
  const withStubbedFetch = async (
    handler: (url: string, init: RequestInit) => Response,
    run: (calls: string[]) => Promise<void>
  ) => {
    const original = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = (async (u: any, init: any) => {
      calls.push(String(u))
      return handler(String(u), init)
    }) as typeof fetch
    try {
      await run(calls)
    } finally {
      globalThis.fetch = original
    }
  }

  test('never issues a request to a private target', async () => {
    await withStubbedFetch(
      () => new Response(null, { status: 200 }),
      async (calls) => {
        await assert.rejects(
          safeFetch('http://169.254.169.254/latest/meta-data/'),
          /private\/internal host/
        )
        assert.equal(calls.length, 0, 'must not have called fetch at all')
      }
    )
  })

  test('does not follow a redirect into a private host', async () => {
    await withStubbedFetch(
      (url) =>
        url.includes('example.com')
          ? new Response(null, {
              status: 302,
              headers: { location: 'http://169.254.169.254/' },
            })
          : new Response(null, { status: 200 }),
      async (calls) => {
        // The redirect target is private, so following it is refused and the
        // private host is never fetched (only the initial hop was requested).
        await assert.rejects(
          safeFetch('https://example.com/hook'),
          /private\/internal host/
        )
        assert.equal(calls.length, 1)
        assert.ok(calls[0]!.includes('example.com'))
      }
    )
  })

  test('follows a redirect to another public host', async () => {
    await withStubbedFetch(
      (url) =>
        url.includes('start.com')
          ? new Response(null, {
              status: 302,
              headers: { location: 'https://end.com/final' },
            })
          : new Response('ok', { status: 200 }),
      async (calls) => {
        const res = await safeFetch('https://start.com')
        assert.equal(res.status, 200)
        assert.deepEqual(calls, ['https://start.com/', 'https://end.com/final'])
      }
    )
  })

  const withHeaderCapturingFetch = async (
    handler: (url: string) => Response,
    run: (
      headersByUrl: Array<{ url: string; headers: Headers }>
    ) => Promise<void>
  ) => {
    const original = globalThis.fetch
    const seen: Array<{ url: string; headers: Headers }> = []
    globalThis.fetch = (async (u: any, init: any) => {
      seen.push({ url: String(u), headers: new Headers(init?.headers) })
      return handler(String(u))
    }) as typeof fetch
    try {
      await run(seen)
    } finally {
      globalThis.fetch = original
    }
  }

  test('strips Authorization and Cookie when a redirect crosses origin', async () => {
    await withHeaderCapturingFetch(
      (url) =>
        url.includes('start.com')
          ? new Response(null, {
              status: 302,
              headers: { location: 'https://other.com/final' },
            })
          : new Response('ok', { status: 200 }),
      async (seen) => {
        await safeFetch('https://start.com', {
          headers: {
            authorization: 'Bearer secret',
            cookie: 'session=abc',
            'x-trace': 'keep-me',
          },
        })
        assert.equal(seen.length, 2)
        assert.equal(seen[0]!.headers.get('authorization'), 'Bearer secret')
        assert.equal(seen[1]!.url, 'https://other.com/final')
        assert.equal(seen[1]!.headers.get('authorization'), null)
        assert.equal(seen[1]!.headers.get('cookie'), null)
        assert.equal(seen[1]!.headers.get('x-trace'), 'keep-me')
      }
    )
  })

  test('preserves Authorization and Cookie on a same-origin redirect', async () => {
    await withHeaderCapturingFetch(
      (url) =>
        url.endsWith('/a')
          ? new Response(null, {
              status: 302,
              headers: { location: 'https://same.com/b' },
            })
          : new Response('ok', { status: 200 }),
      async (seen) => {
        await safeFetch('https://same.com/a', {
          headers: { authorization: 'Bearer secret', cookie: 'session=abc' },
        })
        assert.equal(seen.length, 2)
        assert.equal(seen[1]!.url, 'https://same.com/b')
        assert.equal(seen[1]!.headers.get('authorization'), 'Bearer secret')
        assert.equal(seen[1]!.headers.get('cookie'), 'session=abc')
      }
    )
  })

  const withMethodCapturingFetch = async (
    handler: (url: string) => Response,
    run: (
      seen: Array<{ url: string; method: string; body: unknown }>
    ) => Promise<void>
  ) => {
    const original = globalThis.fetch
    const seen: Array<{ url: string; method: string; body: unknown }> = []
    globalThis.fetch = (async (u: any, init: any) => {
      seen.push({
        url: String(u),
        method: (init?.method ?? 'GET').toUpperCase(),
        body: init?.body,
      })
      return handler(String(u))
    }) as typeof fetch
    try {
      await run(seen)
    } finally {
      globalThis.fetch = original
    }
  }

  test('rewrites POST to GET and drops the body on a 303 redirect', async () => {
    await withMethodCapturingFetch(
      (url) =>
        url.endsWith('/submit')
          ? new Response(null, {
              status: 303,
              headers: { location: 'https://start.com/result' },
            })
          : new Response('ok', { status: 200 }),
      async (seen) => {
        await safeFetch('https://start.com/submit', {
          method: 'POST',
          body: 'payload',
          headers: { 'content-type': 'text/plain' },
        })
        assert.equal(seen.length, 2)
        assert.equal(seen[1]!.method, 'GET')
        assert.equal(seen[1]!.body, undefined)
      }
    )
  })

  test('rewrites POST to GET on a 302 redirect', async () => {
    await withMethodCapturingFetch(
      (url) =>
        url.endsWith('/submit')
          ? new Response(null, {
              status: 302,
              headers: { location: 'https://start.com/result' },
            })
          : new Response('ok', { status: 200 }),
      async (seen) => {
        await safeFetch('https://start.com/submit', {
          method: 'POST',
          body: 'payload',
        })
        assert.equal(seen[1]!.method, 'GET')
        assert.equal(seen[1]!.body, undefined)
      }
    )
  })

  test('preserves method and body on a 307/308 redirect', async () => {
    for (const status of [307, 308]) {
      await withMethodCapturingFetch(
        (url) =>
          url.endsWith('/submit')
            ? new Response(null, {
                status,
                headers: { location: 'https://start.com/result' },
              })
            : new Response('ok', { status: 200 }),
        async (seen) => {
          await safeFetch('https://start.com/submit', {
            method: 'POST',
            body: 'payload',
          })
          assert.equal(seen[1]!.method, 'POST', `status ${status}`)
          assert.equal(seen[1]!.body, 'payload', `status ${status}`)
        }
      )
    }
  })

  test('does not follow non-redirect 3xx statuses even with a Location', async () => {
    for (const status of [300, 304, 305, 306]) {
      await withStubbedFetch(
        () =>
          new Response(null, {
            status,
            headers: { location: 'https://end.com/final' },
          }),
        async (calls) => {
          const res = await safeFetch('https://start.com')
          assert.equal(res.status, status, `status ${status}`)
          assert.equal(calls.length, 1, `status ${status} must not follow`)
        }
      )
    }
  })

  test('cancels the intermediate redirect response body before following', async () => {
    const original = globalThis.fetch
    let cancelled = false
    globalThis.fetch = (async (u: any) => {
      if (String(u).endsWith('/a')) {
        const body = new ReadableStream({
          cancel() {
            cancelled = true
          },
        })
        return new Response(body, {
          status: 302,
          headers: { location: 'https://start.com/b' },
        })
      }
      return new Response('ok', { status: 200 })
    }) as typeof fetch
    try {
      await safeFetch('https://start.com/a')
    } finally {
      globalThis.fetch = original
    }
    assert.equal(cancelled, true, 'intermediate body should be cancelled')
  })

  test('forces redirect:manual on the underlying fetch', async () => {
    await withStubbedFetch(
      () => new Response('ok', { status: 200 }),
      async () => {
        let seenRedirect: RequestRedirect | undefined
        const original = globalThis.fetch
        globalThis.fetch = (async (_u: any, init: any) => {
          seenRedirect = init?.redirect
          return new Response('ok', { status: 200 })
        }) as typeof fetch
        try {
          await safeFetch('https://example.com', { redirect: 'follow' })
        } finally {
          globalThis.fetch = original
        }
        assert.equal(seenRedirect, 'manual')
      }
    )
  })
})
