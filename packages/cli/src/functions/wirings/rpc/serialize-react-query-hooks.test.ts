import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeReactQueryHooks } from './serialize-react-query-hooks.js'

const RPC_MAP = './pikku-rpc-map.gen.js'

describe('serializeReactQueryHooks', () => {
  test('an app with no auth gets no useSession, and no import for it', () => {
    const output = serializeReactQueryHooks(RPC_MAP)
    assert.ok(!output.includes('useSession'))
    assert.ok(
      output.includes("import { usePikkuRPC } from '@pikku/react'"),
      'usePikkuFetch must not be imported when nothing uses it'
    )
  })

  describe('auth → useSession', () => {
    const stateless = serializeReactQueryHooks(RPC_MAP, undefined, {
      statelessCookie: true,
    })

    test('emits the hook and imports the fetch client it reaches for', () => {
      assert.ok(stateless.includes('export const useSession'))
      assert.ok(
        stateless.includes(
          "import { usePikkuRPC, usePikkuFetch } from '@pikku/react'"
        )
      )
    })

    /* The whole point: the cookie is re-minted because something re-reads the
       session on a timer, not because a second mechanism pushes at it. */
    test('refetches on an interval and on focus, which is what keeps the cookie alive', () => {
      assert.match(stateless, /refetchInterval: SESSION_REFETCH_MS/)
      assert.match(stateless, /refetchOnWindowFocus: true/)
      assert.match(stateless, /const SESSION_REFETCH_MS = 10 \* 60 \* 1000/)
    })

    /* Without this better-auth answers from its cookie cache and never rewrites
       the cookie, so the query would refetch forever and still expire. */
    test('asks better-auth to skip its cookie cache', () => {
      assert.ok(
        stateless.includes('/auth/get-session?disableCookieCache=true'),
        'the stateless path must force a database read'
      )
    })

    test('options are spread last, so a caller can override the cadence', () => {
      assert.match(stateless, /staleTime: SESSION_STALE_MS,\n\s*\.\.\.options,/)
    })

    /* A stateful app rewrites the cookie on every get-session anyway, so making
       it skip the cache would buy a database read per refetch and nothing else. */
    test('without cookieCache the hook is still emitted, but reads the cache', () => {
      const stateful = serializeReactQueryHooks(RPC_MAP, undefined, {
        statelessCookie: false,
      })
      assert.ok(stateful.includes('export const useSession'))
      assert.ok(!stateful.includes('disableCookieCache'))
      assert.ok(stateful.includes("fetch.fetch('/auth/get-session', 'GET'"))
    })

    test('sits alongside the workflow hooks rather than displacing them', () => {
      const both = serializeReactQueryHooks(RPC_MAP, './workflow-map.gen.js', {
        statelessCookie: true,
      })
      assert.ok(both.includes('export const useSession'))
      assert.ok(both.includes('export const useRunWorkflow'))
      assert.ok(both.includes('export const usePikkuQuery'))
    })
  })
})
