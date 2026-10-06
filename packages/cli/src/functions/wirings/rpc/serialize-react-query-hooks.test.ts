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

  describe('stub hooks', () => {
    const output = serializeReactQueryHooks(RPC_MAP)
    const segment = output.slice(
      output.indexOf('type StubOptions'),
      output.indexOf('type PaginatedKeys')
    )
    const load = (env: { DEV?: boolean; VITE_MOCK?: string }) => {
      const code = ts.transpileModule(segment.replace(/import\.meta/g, '__meta').replace(/export const/g, 'const'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText
      return new Function(
        'useQuery',
        'useMutation',
        'usePikkuQuery',
        'usePikkuMutation',
        '__meta',
        `${code}; return { registerMocks, defaultMock, usePikkuQueryStub, usePikkuMutationStub }`
      )(
        (o: unknown) => ({ via: 'useQuery', o }),
        (o: unknown) => ({ via: 'useMutation', o }),
        (...a: unknown[]) => ({ via: 'usePikkuQuery', a }),
        (...a: unknown[]) => ({ via: 'usePikkuMutation', a }),
        { env }
      )
    }
    const files = {
      '/.mocks/reminders.list/healthy.json': async () => ({ default: [{ id: 1 }] }),
      '/.mocks/reminders.list/empty.json': async () => ({ default: [] }),
    }
    const meta = {
      '/.mocks/reminders.list/healthy.meta.json': { default: { default: true } },
      '/.mocks/reminders.list/empty.meta.json': { default: { default: false } },
    }

    test('in dev the query answers with the default mock and never calls the backend', async () => {
      const api = load({ DEV: true })
      api.registerMocks(files, meta)
      const result = api.usePikkuQueryStub('reminders:list', { featureFlag: 'reminders' })
      assert.strictEqual(result.via, 'useQuery')
      assert.deepStrictEqual(await result.o.queryFn(), [{ id: 1 }])
    })

    test('VITE_MOCK enables it outside dev', async () => {
      const api = load({ VITE_MOCK: '1' })
      api.registerMocks(files, meta)
      const result = api.usePikkuMutationStub('reminders:list', { featureFlag: 'reminders' })
      assert.strictEqual(result.via, 'useMutation')
      assert.deepStrictEqual(await result.o.mutationFn(), [{ id: 1 }])
    })

    test('in production both are exactly the plain hooks', () => {
      const api = load({})
      const q = api.usePikkuQueryStub('reminders:list', { featureFlag: 'reminders' }, { a: 1 }, { enabled: true })
      assert.deepStrictEqual(q, { via: 'usePikkuQuery', a: ['reminders:list', { a: 1 }, { enabled: true }] })
      const m = api.usePikkuMutationStub('reminders:list', { featureFlag: 'reminders' }, { retry: 1 })
      assert.deepStrictEqual(m, { via: 'usePikkuMutation', a: ['reminders:list', { retry: 1 }] })
    })

    test('a stub with no default mock fails loudly', async () => {
      const api = load({ DEV: true })
      api.registerMocks(files, meta)
      await assert.rejects(() => api.defaultMock('missing:rpc'), /No default mock for missing:rpc/)
    })
  })
})
