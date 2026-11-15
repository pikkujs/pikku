import { describe, test } from 'node:test'
import assert from 'node:assert'
import ts from 'typescript'
import { serializeReactQueryHooks } from './serialize-react-query-hooks.js'
import {
  mockFlaggedNames,
  serializeMocksModule,
} from './serialize-mocks-module.js'

/*
 * The mock client is generated code, so these run the generated text: the
 * hooks file from its mock section to the end, transpiled, with the React and
 * React Query hooks replaced by recorders.
 */
const output = serializeReactQueryHooks('./pikku-rpc-map.gen.js')
const segment = output.slice(output.indexOf('type MockGlob'))

const load = () => {
  const code = ts.transpileModule(
    segment
      .replace(/import\.meta/g, '__meta')
      .replace(/export (const|type)/g, '$1'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText
  const context: { rpc?: unknown } = {}
  const api = new Function(
    'useQuery',
    'useMutation',
    'useInfiniteQuery',
    'usePikkuRPC',
    'retryUnlessClientError',
    '__meta',
    `${code}; return { registerMocks, createMockPikkuClient, setMockScenario, setMockScenarios, clearMockScenarios, resetMockQueries, mockResponse, usePikkuInfiniteQuery }`
  )(
    (o: unknown) => o,
    (o: unknown) => o,
    (o: unknown) => o,
    () => context.rpc,
    () => true,
    { env: {} }
  )
  return { api, context }
}

const files = {
  '/.mocks/listJobs/healthy.json': async () => [{ id: 'j1' }],
  '/.mocks/listJobs/empty.json': async () => [],
  '/.mocks/listJobs/slow.json': async () => [{ id: 'slow' }],
  '/.mocks/listJobs/error.json': async () => ({ message: 'jobs are down' }),
  '/.mocks/listJobs/forbidden.json': async () => ({}),
  '/.mocks/draftQuote/healthy.json': async () => ({ quoteId: 'q1' }),
}
const meta = {
  '/.mocks/listJobs/healthy.meta.json': { state: 'healthy', default: true },
  '/.mocks/listJobs/empty.meta.json': { state: 'empty' },
  '/.mocks/listJobs/slow.meta.json': { state: 'healthy', delayMs: 60 },
  '/.mocks/listJobs/error.meta.json': { state: 'error', status: 503 },
  '/.mocks/listJobs/forbidden.meta.json': { status: 403 },
  '/.mocks/draftQuote/healthy.meta.json': { default: true },
}

const fakeFallback = () => {
  const calls: unknown[][] = []
  return {
    calls,
    pikku: {
      rpc: {
        invoke: async (...args: unknown[]) => (calls.push(args), 'real'),
        startWorkflow(this: { tag: string }) {
          return this.tag
        },
        tag: 'bound to the real rpc',
      },
      fetch: { fetch: async () => 'real fetch' },
      analytics: { event: () => {} },
    },
  }
}

describe('mock client', () => {
  test('answers the default scenario, then the selected one, then the default again', async () => {
    const { api } = load()
    api.registerMocks(files, meta)
    const pikku = api.createMockPikkuClient([])
    assert.deepStrictEqual(await pikku.rpc.invoke('listJobs', {}), [
      { id: 'j1' },
    ])
    api.setMockScenario('listJobs', 'empty')
    assert.deepStrictEqual(await pikku.rpc.invoke('listJobs', {}), [])
    api.setMockScenarios({ listJobs: 'slow.json', draftQuote: 'healthy' })
    assert.deepStrictEqual(await pikku.rpc.invoke('listJobs', {}), [
      { id: 'slow' },
    ])
    api.setMockScenario('listJobs', null)
    assert.deepStrictEqual(await pikku.rpc.invoke('listJobs', {}), [
      { id: 'j1' },
    ])
    api.setMockScenario('listJobs', 'nope')
    await assert.rejects(pikku.rpc.invoke('listJobs', {}), {
      message: 'No mock scenario "nope" for listJobs in .mocks/listJobs/',
    })
    api.clearMockScenarios()
    assert.deepStrictEqual(await pikku.rpc.invoke('listJobs', {}), [
      { id: 'j1' },
    ])
  })

  test('waits the delayMs a scenario meta asks for', async () => {
    const { api } = load()
    api.registerMocks(files, meta)
    api.setMockScenario('listJobs', 'slow')
    const started = Date.now()
    await api.createMockPikkuClient([]).rpc.invoke('listJobs', {})
    assert.ok(Date.now() - started >= 55, 'answered before delayMs')
  })

  test('an error scenario rejects with its status, its message and the file as body', async () => {
    const { api } = load()
    api.registerMocks(files, meta)
    const pikku = api.createMockPikkuClient([])
    api.setMockScenario('listJobs', 'error')
    await assert.rejects(pikku.rpc.invoke('listJobs', {}), (error: any) => {
      assert.ok(error instanceof Error)
      assert.strictEqual(error.message, 'jobs are down')
      assert.strictEqual(error.status, 503)
      assert.deepStrictEqual(error.body, { message: 'jobs are down' })
      return true
    })
    // A status alone is enough, and a body without a message gets one.
    api.setMockScenario('listJobs', 'forbidden')
    await assert.rejects(pikku.rpc.invoke('listJobs', {}), {
      status: 403,
      message: 'listJobs failed (mock scenario "forbidden", status 403)',
    })
  })

  test("mode 'all' mocks every call and names the folder a missing one needs", async () => {
    const { api } = load()
    api.registerMocks(files, meta)
    const { pikku: fallback, calls } = fakeFallback()
    const pikku = api.createMockPikkuClient(['draftQuote'], {
      fallback,
      mode: 'all',
    })
    assert.deepStrictEqual(await pikku.rpc.invoke('listJobs', {}), [
      { id: 'j1' },
    ])
    await assert.rejects(pikku.rpc.invoke('getProfile', {}), {
      message:
        'function getProfile is called on the mock client but has no mock data (.mocks/getProfile/)',
    })
    assert.strictEqual(calls.length, 0)
  })

  test("mode 'flagged' mocks only the mock: true functions and sends the rest to the fallback", async () => {
    const { api } = load()
    api.registerMocks(files, meta)
    const { pikku: fallback, calls } = fakeFallback()
    // flagged is the default once there is a fallback
    const pikku = api.createMockPikkuClient(
      new Set(['draftQuote', 'approveQuote']),
      { fallback }
    )
    assert.deepStrictEqual(await pikku.rpc.invoke('draftQuote', {}), {
      quoteId: 'q1',
    })
    assert.strictEqual(
      await pikku.rpc.invoke('listJobs', { companyId: 'c' }),
      'real'
    )
    assert.deepStrictEqual(calls, [['listJobs', { companyId: 'c' }]])
    await assert.rejects(pikku.rpc.invoke('approveQuote', {}), {
      message:
        'function approveQuote is mocked but has no mock data (.mocks/approveQuote/)',
    })
    // every other member is the fallback's, bound to it
    assert.strictEqual(pikku.rpc.startWorkflow(), 'bound to the real rpc')
    assert.strictEqual(await pikku.fetch.fetch('/x', 'GET'), 'real fetch')
    assert.strictEqual(pikku.analytics, fallback.analytics)
    assert.throws(
      () => api.createMockPikkuClient([], { mode: 'flagged' }),
      /needs a fallback/
    )
  })

  test('without a fallback the session is signed out and nothing looks like a promise', async () => {
    const { api } = load()
    api.registerMocks(files, meta)
    const pikku = api.createMockPikkuClient([])
    const session = await pikku.fetch.fetch(
      '/auth/get-session',
      'GET',
      undefined
    )
    assert.strictEqual(session.ok, true)
    assert.strictEqual(await session.json(), null)
    const other = await pikku.fetch.fetch('/orders', 'POST', {})
    assert.strictEqual(other.status, 404)
    assert.strictEqual(pikku.rpc.then, undefined)
    await assert.rejects(pikku.rpc.runWorkflow('w', {}), {
      message: 'rpc.runWorkflow is not mocked',
    })
  })

  test('changing a scenario resets the queries of that function on the given QueryClient', () => {
    const { api } = load()
    api.registerMocks(files, meta)
    const resets: ((query: { queryKey: unknown[] }) => boolean)[] = []
    const queryClient = {
      resetQueries: ({ predicate }: { predicate: any }) => {
        resets.push(predicate)
      },
    }
    const pikku = api.createMockPikkuClient([], { queryClient })
    api.setMockScenario('listJobs', 'empty')
    assert.strictEqual(resets.length, 1)
    assert.strictEqual(resets[0]!({ queryKey: ['listJobs', {}] }), true)
    assert.strictEqual(resets[0]!({ queryKey: ['draftQuote', {}] }), false)
    api.clearMockScenarios()
    assert.strictEqual(resets.length, 2)
    assert.strictEqual(resets[1]!({ queryKey: ['listJobs', {}] }), true)
    pikku.dispose()
    api.setMockScenario('listJobs', 'empty')
    assert.strictEqual(resets.length, 2, 'a disposed client stops listening')
    api.resetMockQueries(queryClient)
    assert.strictEqual(resets[2]!({ queryKey: ['anything'] }), true)
  })

  test('usePikkuInfiniteQuery needs no mock branch: its pages go through rpc.invoke', async () => {
    const { api, context } = load()
    api.registerMocks(
      {
        '/.mocks/listHistory/healthy.json': async () => ({
          items: [1],
          nextCursor: 'c2',
        }),
      },
      { '/.mocks/listHistory/healthy.meta.json': { default: true } }
    )
    const pikku = api.createMockPikkuClient([])
    const seen: unknown[][] = []
    const invoke = pikku.rpc.invoke
    context.rpc = {
      invoke: (...args: unknown[]) => (seen.push(args), invoke(...args)),
    }
    const options = api.usePikkuInfiniteQuery('listHistory', { limit: 5 })
    const page = await options.queryFn({ pageParam: 'c1' })
    assert.deepStrictEqual(page, { items: [1], nextCursor: 'c2' })
    assert.deepStrictEqual(seen, [['listHistory', { limit: 5, cursor: 'c1' }]])
    assert.strictEqual(options.getNextPageParam(page), 'c2')
  })
})

describe('mocks module', () => {
  test('emits the mock: true names and a createMockPikku that registers the library first', () => {
    const out = serializeMocksModule(
      '/r/src/mocks.gen.ts',
      './api.gen.js',
      '/r/.mocks',
      [],
      true,
      ['approveQuote', 'draftQuote']
    )
    assert.match(
      out,
      /export const mockFlagged: ReadonlySet<string> = new Set<string>\(\["approveQuote","draftQuote"\]\)/
    )
    assert.match(
      out,
      /export const createMockPikku = \(options\?: MockPikkuOptions\) => \{\n  registerPikkuMocks\(\)\n  return createMockPikkuClient\(mockFlagged, options\)/
    )
    assert.match(
      out,
      /export \{ setMockScenario, setMockScenarios, clearMockScenarios, resetMockQueries, mockResponse \} from '\.\/api\.gen\.js'/
    )
  })

  test('with only mock: true functions and no .mocks folder it globs nothing', () => {
    const out = serializeMocksModule(
      '/r/src/mocks.gen.ts',
      './api.gen.js',
      '/r/.mocks',
      [],
      false,
      ['draftQuote']
    )
    assert.doesNotMatch(out, /import\.meta/)
    assert.match(out, /registerMocks\(\[\n\n  \]\)/)
  })

  test('the flagged names are the exposed RPC names of functions declared mock: true', () => {
    assert.deepStrictEqual(
      mockFlaggedNames(
        { zeta: 'zetaFn', alpha: 'alphaFn', real: 'realFn' },
        {
          zetaFn: { mock: true },
          alphaFn: { mock: true },
          realFn: {},
        }
      ),
      ['alpha', 'zeta']
    )
  })
})
