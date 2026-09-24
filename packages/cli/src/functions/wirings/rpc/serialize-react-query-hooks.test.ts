import { describe, test } from 'node:test'
import assert from 'node:assert'
import ts from 'typescript'
import { serializeReactQueryHooks } from './serialize-react-query-hooks.js'

const RPC_MAP = './pikku-rpc-map.gen.js'

describe('serializeReactQueryHooks', () => {
  test('usePikkuQuery does not retry a 4xx, and options can override it', () => {
    const output = serializeReactQueryHooks(RPC_MAP)
    const source = output.match(/const retryUnlessClientError = [\s\S]*?\n\}/)![0]
    const retry = new Function(
      `${ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText}; return retryUnlessClientError`
    )()
    const withStatus = (status?: number) => Object.assign(new Error('x'), { status })
    assert.strictEqual(retry(0, withStatus(404)), false)
    assert.strictEqual(retry(0, withStatus(403)), false)
    assert.strictEqual(retry(0, withStatus(500)), true)
    assert.strictEqual(retry(0, withStatus()), true)
    assert.strictEqual(retry(3, withStatus(500)), false)
    assert.match(output, /retry: retryUnlessClientError,\n    \.\.\.options,/)
  })

  test('an app with no auth gets no useSession, and no import for it', () => {
    const output = serializeReactQueryHooks(RPC_MAP)
    assert.ok(!output.includes('useSession'))
    assert.ok(
      output.includes("import { usePikkuRPC } from '@pikku/react'"),
      'usePikkuFetch must not be imported when nothing uses it'
    )
  })

  describe('auth → useSession', () => {
    const withAuth = serializeReactQueryHooks(RPC_MAP, undefined, true)

    test('emits the hook and imports the fetch client it reaches for', () => {
      assert.ok(withAuth.includes('export const useSession'))
      assert.ok(
        withAuth.includes(
          "import { usePikkuRPC, usePikkuFetch } from '@pikku/react'"
        )
      )
    })

    /* The whole point: the cookie is re-minted because something re-reads the
       session on a timer, not because a second mechanism pushes at it. */
    test('refetches on an interval and on focus, which is what keeps the cookie alive', () => {
      assert.match(withAuth, /refetchInterval: SESSION_REFETCH_MS/)
      assert.match(withAuth, /refetchOnWindowFocus: true/)
      assert.match(withAuth, /const SESSION_REFETCH_MS = 10 \* 60 \* 1000/)
    })

    /* Forcing it would make every refetch a database read to re-mint a cookie
       that has most of its life left. better-auth's cache branch bails on an
       expired payload and falls through to the database by itself, so the read
       happens once, when it is actually needed. */
    test('does not force a database read on every refetch', () => {
      assert.ok(!withAuth.includes('disableCookieCache'))
      assert.ok(withAuth.includes("fetch.fetch('/auth/get-session', 'GET'"))
    })

    test('options are spread last, so a caller can override the cadence', () => {
      assert.match(withAuth, /staleTime: SESSION_STALE_MS,\n\s*\.\.\.options,/)
    })

    test('sits alongside the workflow hooks rather than displacing them', () => {
      const both = serializeReactQueryHooks(
        RPC_MAP,
        './workflow-map.gen.js',
        true
      )
      assert.ok(both.includes('export const useSession'))
      assert.ok(both.includes('export const useRunWorkflow'))
      assert.ok(both.includes('export const usePikkuQuery'))
    })
  })
})
