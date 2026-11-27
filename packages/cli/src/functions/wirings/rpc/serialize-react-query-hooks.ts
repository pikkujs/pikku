import type { StubMock } from './read-stub-mocks.js'

export const serializeReactQueryHooks = (
  rpcMapPath: string,
  workflowMapPath?: string,
  hasAuth?: boolean,
  stubs: StubMock[] = []
) => {
  const stubMap = stubs.length
    ? `{\n${stubs.map((stub) => `  ${JSON.stringify(stub.name)}: { output: ${stub.outputType} }`).join('\n')}\n}`
    : '{}'

  const workflowImport = workflowMapPath
    ? `\nimport type { FlattenedWorkflowMap } from '${workflowMapPath}'`
    : ''

  const workflowHooks = workflowMapPath
    ? `
export const useRunWorkflow = <Name extends keyof FlattenedWorkflowMap>(
  name: Name,
  options?: Omit<UseMutationOptions<FlattenedWorkflowMap[Name]['output'], Error, FlattenedWorkflowMap[Name]['input']>, 'mutationFn'>
) => {
  const rpc = usePikkuRPC<{ runWorkflow: <N extends keyof FlattenedWorkflowMap>(name: N, input: FlattenedWorkflowMap[N]['input']) => Promise<FlattenedWorkflowMap[N]['output']> }>()
  return useMutation<FlattenedWorkflowMap[Name]['output'], Error, FlattenedWorkflowMap[Name]['input']>({
    mutationFn: (input) => rpc.runWorkflow(name, input),
    ...options,
  })
}

export const useStartWorkflow = <Name extends keyof FlattenedWorkflowMap>(
  name: Name,
  options?: Omit<UseMutationOptions<{ runId: string }, Error, FlattenedWorkflowMap[Name]['input']>, 'mutationFn'>
) => {
  const rpc = usePikkuRPC<{ startWorkflow: <N extends keyof FlattenedWorkflowMap>(name: N, input: FlattenedWorkflowMap[N]['input']) => Promise<{ runId: string }> }>()
  return useMutation<{ runId: string }, Error, FlattenedWorkflowMap[Name]['input']>({
    mutationFn: (input) => rpc.startWorkflow(name, input),
    ...options,
  })
}

type WorkflowRunStatus = {
  id: string
  status: 'running' | 'suspended' | 'completed' | 'failed' | 'cancelling' | 'cancelled' | 'compensating' | 'compensated' | 'compensation_failed'
  output?: unknown
  error?: { message?: string }
}

export const useWorkflowStatus = (
  workflowName: keyof FlattenedWorkflowMap & string,
  runId?: string,
  options?: Omit<UseQueryOptions<WorkflowRunStatus, Error>, 'queryKey' | 'queryFn' | 'enabled'>
) => {
  const rpc = usePikkuRPC<{ workflowStatus: (name: string, runId: string) => Promise<WorkflowRunStatus> }>()
  return useQuery<WorkflowRunStatus, Error>({
    queryKey: ['workflowStatus', workflowName, runId],
    queryFn: () => {
      if (!runId) throw new Error('runId is required')
      return rpc.workflowStatus(workflowName, runId)
    },
    enabled: !!runId,
    ...options,
  })
}
`
    : ''

  /**
   * The session — and, for free, the thing that heals the session cookie.
   *
   * Under `betterAuthStatelessSession` the signed `session_data` cookie is the
   * only thing authenticating a request, and nothing rewrites it once someone
   * is signed in. When it ages out, better-auth's cookie-cache branch bails on
   * the stale payload and falls through to the database, reading the session
   * from the still-valid `session_token` and minting a fresh cookie on the way
   * out. So an ordinary cached read heals an expired cookie by itself.
   *
   * Which is why this does NOT pass `disableCookieCache`. Forcing it would turn
   * every refetch into a database read — the exact cost the cookie cache exists
   * to avoid — to re-mint a cookie that has most of its life left. The read is
   * worth paying once, when the cookie has actually expired, and that is when
   * better-auth does it anyway.
   *
   * better-auth's own sliding renewal (`session.cookieCache.refreshCache`) is
   * not the answer either: it is force-disabled whenever a database is
   * configured, and where it does apply it re-signs the cached blob without
   * reading the database, so a banned user's cookie would renew forever.
   */
  const sessionImport = hasAuth ? ', usePikkuFetch' : ''

  const sessionHook = hasAuth
    ? `
/* Short enough that an expired cookie is healed long before anyone notices,
   and cheap: while the cookie is good this is a cache hit with no database
   behind it. */
const SESSION_REFETCH_MS = 10 * 60 * 1000
/* A tab flicked away from and back to should not refetch on every glance. */
const SESSION_STALE_MS = 2 * 60 * 1000

export const useSession = <Session = unknown>(
  options?: Omit<UseQueryOptions<Session | null, Error>, 'queryKey' | 'queryFn'>
) => {
  const fetch = usePikkuFetch()
  return useQuery<Session | null, Error>({
    queryKey: ['pikkuSession'],
    queryFn: async () => {
      const response = await fetch.fetch('/auth/get-session', 'GET', undefined)
      if (!response.ok) return null
      // Signed out is a null body, not an error status.
      return ((await response.json().catch(() => null)) ?? null) as Session | null
    },
    refetchInterval: SESSION_REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: SESSION_STALE_MS,
    ...options,
  })
}
`
    : ''

  return `import { useQuery, useInfiniteQuery, useMutation, type UseQueryOptions, type UseInfiniteQueryOptions, type UseMutationOptions, type InfiniteData } from '@tanstack/react-query'
import { usePikkuRPC${sessionImport} } from '@pikku/react'
import type { PikkuInstance } from '@pikku/react'
import type { FlattenedRPCMap, AgentName, AgentOutputOf } from '${rpcMapPath}'${workflowImport}

// Tells \`usePikkuAgent\` from @pikku/react which agents exist and what each returns.
declare module '@pikku/react' {
  interface PikkuAgentRegistry {
    agents: { [Name in AgentName]: AgentOutputOf<Name> }
  }
}

type RPCInvoke = <Name extends keyof FlattenedRPCMap>(name: Name, data: FlattenedRPCMap[Name]['input']) => Promise<FlattenedRPCMap[Name]['output']>

const retryUnlessClientError = (failureCount: number, error: Error) => {
  const status = (error as { status?: number }).status
  return !(status !== undefined && status >= 400 && status < 500) && failureCount < 3
}

type MockGlob = Record<string, () => Promise<unknown>>
export type MockSource = { namespace?: string; files: MockGlob; meta: Record<string, unknown> }

let mockSources: MockSource[] = []

export const registerMocks = (
  files: MockGlob | MockSource[],
  meta: Record<string, unknown> = {}
) => {
  const sources = Array.isArray(files) ? files : [{ files, meta }]
  mockSources = [...sources.filter((source) => source.namespace), ...sources.filter((source) => !source.namespace)]
}

const unwrapDefault = (value: unknown) => (value as { default?: unknown })?.default ?? value

const metaOf = (value: unknown) => {
  const inner = (value as { default?: unknown })?.default
  return (inner !== null && typeof inner === 'object' ? inner : value) as { default?: boolean } | undefined
}

/** What a scenario's \`<scenario>.meta.json\` may say. */
export type MockScenarioMeta = { default?: boolean; state?: string; status?: number; delayMs?: number }

type MockScenario = { key: string; file: () => Promise<unknown>; meta?: MockScenarioMeta; app: boolean }

/* Every scenario of one function, keyed by file name without \`.json\`. An app
   scenario replaces an addon one of the same name (app sources come last). */
const mockScenariosFor = (name: string) => {
  const scenarios = new Map<string, MockScenario>()
  for (const source of mockSources) {
    const prefix = source.namespace ? source.namespace + ':' : ''
    if (prefix && !name.startsWith(prefix)) continue
    const dir = '/.mocks/' + (prefix ? name.slice(prefix.length) : name.replace(/:/g, '.')) + '/'
    for (const key of Object.keys(source.files)) {
      if (!key.includes(dir) || key.endsWith('.meta.json')) continue
      const metaKey = key.replace(/\\.json$/, '.meta.json')
      const scenario = key.slice(key.lastIndexOf('/') + 1).replace(/\\.json$/, '')
      scenarios.set(scenario, { key: scenario, file: source.files[key]!, meta: metaKey in source.meta ? metaOf(source.meta[metaKey]) as MockScenarioMeta : undefined, app: !prefix })
    }
  }
  return [...scenarios.values()]
}

/* The named scenario when one is given, else the default: only scenarios with a
   meta file compete for it, app before addon, a lone one wins. */
const mockScenarioFor = (name: string, scenario?: string | null) => {
  const all = mockScenariosFor(name)
  if (scenario != null) return all.find((s) => s.key === scenario.replace(/\\.json$/, ''))
  const described = all.filter((s) => s.meta !== undefined)
  return described.find((s) => s.app && s.meta?.default === true) ?? described.find((s) => s.meta?.default === true) ?? (described.length === 1 ? described[0] : undefined)
}

const mockFileFor = (name: string, scenario?: string | null) => mockScenarioFor(name, scenario)?.file

const hasMock = (name: string) => !!mockFileFor(name)

export const defaultMock = async (name: string) => {
  const file = mockFileFor(name)
  if (!file) throw new Error('No default mock for ' + name + ' in .mocks/')
  return unwrapDefault(await file())
}

/* Which scenario each function answers with on the mock client. A story sets
   these and clears them afterwards; a function with none answers its default. */
const selectedScenarios = new Map<string, string>()
const scenarioListeners = new Set<(names: string[]) => void>()
const scenariosChanged = (names: string[]) => {
  for (const listener of scenarioListeners) listener(names)
}

type MockName = (keyof FlattenedRPCMap & string) | (string & {})

/** Answer \`name\` with \`scenario\` (a \`.mocks/<function>/<scenario>.json\` file name) on the mock client, or with its default again when \`null\`. */
export const setMockScenario = (name: MockName, scenario: string | null) => {
  if (scenario === null) selectedScenarios.delete(name)
  else selectedScenarios.set(name, scenario)
  scenariosChanged([name])
}

/** Several at once: \`setMockScenarios({ listJobs: 'empty', getJob: 'error' })\`. */
export const setMockScenarios = (scenarios: Partial<Record<MockName, string | null>>) => {
  for (const [name, scenario] of Object.entries(scenarios)) {
    if (scenario == null) selectedScenarios.delete(name)
    else selectedScenarios.set(name, scenario)
  }
  scenariosChanged(Object.keys(scenarios))
}

/** Every function back to its default scenario, for the end of a story. */
export const clearMockScenarios = () => {
  const names = [...selectedScenarios.keys()]
  selectedScenarios.clear()
  scenariosChanged(names)
}

const mockDirOf = (name: string) => '.mocks/' + name.replace(/:/g, '.') + '/'

/**
 * The answer \`name\` gets on the mock client: the selected scenario, else the
 * default. Waits \`delayMs\` from the scenario's meta, and rejects with an Error
 * carrying \`status\` (and the file as \`body\`) when the meta says
 * \`state: 'error'\` or a \`status\` of 400 or more.
 */
export const mockResponse = async (name: string, scenario: string | null = selectedScenarios.get(name) ?? null) => {
  const found = mockScenarioFor(name, scenario)
  if (!found) {
    throw new Error(scenario != null ? 'No mock scenario "' + scenario + '" for ' + name + ' in ' + mockDirOf(name) : 'No default mock for ' + name + ' in ' + mockDirOf(name))
  }
  const meta = found.meta ?? {}
  if (meta.delayMs) await new Promise((resolve) => setTimeout(resolve, meta.delayMs))
  const body = unwrapDefault(await found.file())
  const status = meta.status ?? (meta.state === 'error' ? 500 : 200)
  if (meta.state === 'error' || status >= 400) {
    const message = (body as { message?: unknown })?.message
    throw Object.assign(new Error(typeof message === 'string' ? message : name + ' failed (mock scenario "' + found.key + '", status ' + status + ')'), { status, body, scenario: found.key })
  }
  return body
}

type QueryResetter = { resetQueries: (filters: { predicate: (query: { queryKey: readonly unknown[] }) => boolean }) => unknown }

export type MockPikkuOptions = {
  /** The real client. Without one every call is mocked. */
  fallback?: PikkuInstance
  /** \`all\` mocks every call (the default without a fallback); \`flagged\` mocks only the functions declared \`mock: true\` (the default with one). */
  mode?: 'all' | 'flagged'
  /** Reset this client's queries of a function whenever its scenario changes, so a screen shows the new one. */
  queryClient?: QueryResetter
}

/** Drop and refetch the cached queries of \`names\` (all of them without \`names\`). */
export const resetMockQueries = (queryClient: QueryResetter, names?: string[]) =>
  queryClient.resetQueries({ predicate: (query) => !names || names.includes(query.queryKey[0] as string) })

const delegate = (target: Record<string | symbol, unknown>, fallback: Record<string | symbol, unknown> | undefined, missing: (prop: string) => unknown) =>
  new Proxy(target, {
    get: (own, prop) => {
      if (prop in own) return own[prop]
      if (fallback) {
        const value = fallback[prop]
        return typeof value === 'function' ? value.bind(fallback) : value
      }
      // Never look like a promise, or awaiting the client would call this.
      return typeof prop === 'symbol' || prop === 'then' ? undefined : missing(prop)
    },
  })

/**
 * A Pikku instance that answers from the \`.mocks/\` library, for
 * \`PikkuProvider\`. Use \`createMockPikku\` from the generated mocks module,
 * which registers the library and knows which functions are \`mock: true\`.
 */
export const createMockPikkuClient = (flagged: Iterable<string>, options: MockPikkuOptions = {}): PikkuInstance & { dispose: () => void } => {
  const { fallback, queryClient } = options
  const mode = options.mode ?? (fallback ? 'flagged' : 'all')
  if (mode === 'flagged' && !fallback) throw new Error("createMockPikku: mode 'flagged' needs a fallback client for the functions that are not mocked")
  const flaggedNames = new Set(flagged)

  const invoke = (name: string, data: unknown) => {
    if (mode === 'flagged' && !flaggedNames.has(name)) return fallback!.rpc.invoke(name, data)
    if (!selectedScenarios.has(name) && !mockScenarioFor(name)) {
      return Promise.reject(new Error('function ' + name + (flaggedNames.has(name) ? ' is mocked' : ' is called on the mock client') + ' but has no mock data (' + mockDirOf(name) + ')'))
    }
    return mockResponse(name)
  }

  // Signed out: the session hook reads a null body, not an error.
  const mockFetch = async (path: string, method?: string) =>
    path.replace(/\\?.*$/, '').endsWith('/auth/get-session')
      ? new Response('null', { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ message: (method ?? 'GET') + ' ' + path + ' is not mocked' }), { status: 404, headers: { 'content-type': 'application/json' } })

  const rpc = delegate({ invoke }, fallback?.rpc, (prop) => () => Promise.reject(new Error('rpc.' + prop + ' is not mocked')))
  const fetch = mode === 'flagged' ? fallback!.fetch : delegate({ fetch: mockFetch }, fallback?.fetch as unknown as Record<string, unknown>, () => undefined)

  const listener = (names: string[]) => void (queryClient && resetMockQueries(queryClient, names))
  if (queryClient) scenarioListeners.add(listener)

  return { ...fallback, rpc, fetch: fetch as PikkuInstance['fetch'], dispose: () => void scenarioListeners.delete(listener) }
}

export const usePikkuQuery = <Name extends keyof FlattenedRPCMap>(
  name: Name,
  data: FlattenedRPCMap[Name]['input'],
  options?: Omit<UseQueryOptions<FlattenedRPCMap[Name]['output'], Error>, 'queryKey' | 'queryFn'>
) => {
  const rpc = usePikkuRPC<{ invoke: RPCInvoke }>()
  return useQuery<FlattenedRPCMap[Name]['output'], Error>({
    queryKey: [name, data],
    queryFn: () => {
      // @ts-ignore
      if (import.meta.env.VITE_MOCK && hasMock(name as string)) return defaultMock(name as string) as Promise<FlattenedRPCMap[Name]['output']>
      return rpc.invoke(name, data)
    },
    retry: retryUnlessClientError,
    ...options,
  })
}

export const usePikkuMutation = <Name extends keyof FlattenedRPCMap>(
  name: Name,
  options?: Omit<UseMutationOptions<FlattenedRPCMap[Name]['output'], Error, FlattenedRPCMap[Name]['input']>, 'mutationFn'>
) => {
  const rpc = usePikkuRPC<{ invoke: RPCInvoke }>()
  return useMutation<FlattenedRPCMap[Name]['output'], Error, FlattenedRPCMap[Name]['input']>({
    mutationFn: (data) => {
      // @ts-ignore
      if (import.meta.env.VITE_MOCK && hasMock(name as string)) return defaultMock(name as string) as Promise<FlattenedRPCMap[Name]['output']>
      return rpc.invoke(name, data)
    },
    ...options,
  })
}

type StubMap = ${stubMap}

type StubName = keyof StubMap

type StubOptions = { featureFlag?: string; input?: Record<string, unknown> }

type StubInvoke = (name: string, data: unknown) => Promise<unknown>

export const usePikkuQueryStub = <Name extends StubName>(
  name: Name,
  stub: StubOptions = {},
  options?: Omit<UseQueryOptions<StubMap[Name]['output'], Error>, 'queryKey' | 'queryFn'>
) => {
  const rpc = usePikkuRPC<{ invoke: StubInvoke }>()
  return useQuery<StubMap[Name]['output'], Error>({
    queryKey: [name, stub.input],
    queryFn: () => {
      // @ts-ignore
      if (import.meta.env.DEV || import.meta.env.VITE_MOCK) return defaultMock(name) as Promise<StubMap[Name]['output']>
      return rpc.invoke(name, stub.input) as Promise<StubMap[Name]['output']>
    },
    retry: retryUnlessClientError,
    ...options,
  })
}

export const usePikkuMutationStub = <Name extends StubName>(
  name: Name,
  stub: StubOptions = {},
  options?: Omit<UseMutationOptions<StubMap[Name]['output'], Error, Record<string, unknown>>, 'mutationFn'>
) => {
  const rpc = usePikkuRPC<{ invoke: StubInvoke }>()
  return useMutation<StubMap[Name]['output'], Error, Record<string, unknown>>({
    mutationFn: (data) => {
      // @ts-ignore
      if (import.meta.env.DEV || import.meta.env.VITE_MOCK) return defaultMock(name) as Promise<StubMap[Name]['output']>
      return rpc.invoke(name, data ?? stub.input) as Promise<StubMap[Name]['output']>
    },
    ...options,
  })
}

type PaginatedKeys = {
  [K in keyof FlattenedRPCMap]: FlattenedRPCMap[K]['output'] extends { nextCursor?: string | null } ? K : never
}[keyof FlattenedRPCMap]

type InfiniteOpts<Name extends PaginatedKeys> = Omit<
  UseInfiniteQueryOptions<FlattenedRPCMap[Name]['output'], Error, InfiniteData<FlattenedRPCMap[Name]['output'], string | undefined>, readonly unknown[], string | undefined>,
  'queryKey' | 'queryFn' | 'getNextPageParam' | 'initialPageParam'
>

export const usePikkuInfiniteQuery = <Name extends PaginatedKeys>(
  name: Name,
  data: Omit<FlattenedRPCMap[Name]['input'], 'cursor'>,
  options?: InfiniteOpts<Name>
) => {
  const rpc = usePikkuRPC<{ invoke: RPCInvoke }>()
  return useInfiniteQuery({
    queryKey: [name, data] as const,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => rpc.invoke(name, { ...data, cursor: pageParam } as unknown as FlattenedRPCMap[Name]['input']),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: FlattenedRPCMap[Name]['output']) => (lastPage as { nextCursor?: string | null }).nextCursor ?? undefined,
    ...options,
  })
}
${sessionHook}${workflowHooks}`
}
