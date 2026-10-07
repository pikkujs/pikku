import { describe, test } from 'node:test'
import assert from 'node:assert'
import ts from 'typescript'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    const stubs = [
      { name: 'reminders:list', outputType: 'Array<{ "id": number; "note"?: string }>' },
    ]
    const output = serializeReactQueryHooks(RPC_MAP, undefined, false, stubs)
    const segment = output.slice(
      output.indexOf('let mockFiles'),
      output.indexOf('type PaginatedKeys')
    )

    const load = (env: { DEV?: boolean; VITE_MOCK?: string }) => {
      const code = ts.transpileModule(
        segment.replace(/import\.meta/g, '__meta').replace(/export const/g, 'const'),
        { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
      ).outputText
      const calls: unknown[][] = []
      const api = new Function(
        'useQuery',
        'useMutation',
        'usePikkuRPC',
        'retryUnlessClientError',
        '__meta',
        `${code}; return { registerMocks, defaultMock, usePikkuQuery, usePikkuMutation, usePikkuQueryStub, usePikkuMutationStub }`
      )(
        (o: unknown) => ({ via: 'useQuery', o }),
        (o: unknown) => ({ via: 'useMutation', o }),
        () => ({ invoke: async (...a: unknown[]) => (calls.push(a), 'real') }),
        () => true,
        { env }
      )
      return { api, calls }
    }
    const files = {
      '/.mocks/reminders.list/healthy.json': async () => ({ default: [{ id: 1 }] }),
      '/.mocks/reminders.list/empty.json': async () => ({ default: [] }),
    }
    const meta = {
      '/.mocks/reminders.list/healthy.meta.json': { default: { default: true } },
      '/.mocks/reminders.list/empty.meta.json': { default: { default: false } },
    }

    test('in dev the stub query answers with the default mock and never calls the backend', async () => {
      const { api, calls } = load({ DEV: true })
      api.registerMocks(files, meta)
      const result = api.usePikkuQueryStub('reminders:list', { featureFlag: 'reminders' })
      assert.strictEqual(result.via, 'useQuery')
      assert.deepStrictEqual(await result.o.queryFn(), [{ id: 1 }])
      assert.strictEqual(calls.length, 0)
    })

    test('VITE_MOCK enables the stub mutation outside dev', async () => {
      const { api } = load({ VITE_MOCK: '1' })
      api.registerMocks(files, meta)
      const result = api.usePikkuMutationStub('reminders:list', { featureFlag: 'reminders' })
      assert.strictEqual(result.via, 'useMutation')
      assert.deepStrictEqual(await result.o.mutationFn({}), [{ id: 1 }])
    })

    test('in production the stub is a plain backend call with its input', async () => {
      const { api, calls } = load({})
      api.registerMocks(files, meta)
      const q = api.usePikkuQueryStub('reminders:list', { featureFlag: 'reminders', input: { a: 1 } })
      assert.strictEqual(await q.o.queryFn(), 'real')
      assert.deepStrictEqual(calls[0], ['reminders:list', { a: 1 }])
      const m = api.usePikkuMutationStub('reminders:list', { featureFlag: 'reminders' })
      assert.strictEqual(await m.o.mutationFn({ b: 2 }), 'real')
      assert.deepStrictEqual(calls[1], ['reminders:list', { b: 2 }])
    })

    test('the plain hook uses a mock only in mock mode and only when one exists', async () => {
      const dev = load({ DEV: true })
      dev.api.registerMocks(files, meta)
      const devQuery = dev.api.usePikkuQuery('reminders:list', {})
      assert.strictEqual(await devQuery.o.queryFn(), 'real')

      const mocked = load({ VITE_MOCK: '1' })
      mocked.api.registerMocks(files, meta)
      assert.deepStrictEqual(await mocked.api.usePikkuQuery('reminders:list', {}).o.queryFn(), [{ id: 1 }])
      assert.strictEqual(await mocked.api.usePikkuQuery('other:rpc', {}).o.queryFn(), 'real')
    })

    test('reads the env as literal import.meta.env.* so a bundler folds the mock path away in production', () => {
      assert.match(segment, /import\.meta\.env\.DEV \|\| import\.meta\.env\.VITE_MOCK/)
      assert.match(segment, /import\.meta\.env\.VITE_MOCK && hasMock/)
      assert.doesNotMatch(segment, /const \w+ = \(?import\.meta/)
    })

    test('a stub with no default mock fails loudly', async () => {
      const { api } = load({ DEV: true })
      api.registerMocks(files, meta)
      await assert.rejects(() => api.defaultMock('missing:rpc'), /No default mock for missing:rpc/)
    })

    describe('types', () => {
      const dir = mkdtempSync(join(tmpdir(), 'stub-hooks-'))
      const write = (name: string, body: string) => writeFileSync(join(dir, name), body)
      write('pikku-rpc-map.gen.d.ts', `export type FlattenedRPCMap = { 'bookings:list': { input: { page: number }; output: { id: number }[] } }`)
      write('shims.d.ts', `
declare module '@tanstack/react-query' {
  export type UseQueryOptions<T, E> = { [k: string]: unknown }
  export type UseInfiniteQueryOptions<A, B, C, D, E> = { [k: string]: unknown }
  export type UseMutationOptions<T, E, V> = { [k: string]: unknown }
  export type InfiniteData<A, B> = unknown
  export const useQuery: <T, E>(o: { queryKey: unknown[]; queryFn: () => Promise<T> | T; [k: string]: unknown }) => { data?: T }
  export const useInfiniteQuery: (o: any) => any
  export const useMutation: <T, E, V>(o: { mutationFn: (v: V) => Promise<T> | T; [k: string]: unknown }) => { data?: T }
}
declare module '@pikku/react' { export const usePikkuRPC: <T>() => T }
interface ImportMeta { env: Record<string, any> }
`)
      write('api.ts', output)
      write('use.ts', `
import { usePikkuQuery, usePikkuQueryStub, usePikkuMutationStub } from './api'
const ok = usePikkuQueryStub('reminders:list', { featureFlag: 'x', input: { a: 1 } })
const first: number | undefined = ok.data?.[0]?.id
const note: string | undefined = ok.data?.[0]?.note
usePikkuMutationStub('reminders:list', { featureFlag: 'x' })
usePikkuQuery('bookings:list', { page: 1 })
// @ts-expect-error a stub name that has a real function
usePikkuQueryStub('bookings:list', { featureFlag: 'x' })
// @ts-expect-error the plain hook does not accept a stub-only name
usePikkuQuery('reminders:list', {})
// @ts-expect-error a stub name that has no mock
usePikkuQueryStub('nothing:here', { featureFlag: 'x' })
// @ts-expect-error the output is the mock shape
const wrong: string = ok.data?.[0]?.id
export { first, note, wrong }
`)
      test('stub names are the mock-only RPCs and the output is the inferred mock shape', () => {
        const program = ts.createProgram(
          ['pikku-rpc-map.gen.d.ts', 'shims.d.ts', 'api.ts', 'use.ts'].map((f) => join(dir, f)),
          { noEmit: true, strict: true, skipLibCheck: true, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022 }
        )
        const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => `${d.file?.fileName.split('/').pop()}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)
        rmSync(dir, { recursive: true, force: true })
        assert.deepStrictEqual(diagnostics, [])
      })
    })
  })
})
