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

  test('allows public hosts', () => {
    for (const host of ['example.com', '8.8.8.8', '172.32.0.1', '11.0.0.1']) {
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
