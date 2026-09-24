export const serializeReactQueryHooks = (
  rpcMapPath: string,
  workflowMapPath?: string,
  hasAuth?: boolean
) => {
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
  status: 'running' | 'suspended' | 'completed' | 'failed' | 'cancelled'
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
import type { FlattenedRPCMap } from '${rpcMapPath}'${workflowImport}

type RPCInvoke = <Name extends keyof FlattenedRPCMap>(name: Name, data: FlattenedRPCMap[Name]['input']) => Promise<FlattenedRPCMap[Name]['output']>

const retryUnlessClientError = (failureCount: number, error: Error) => {
  const status = (error as { status?: number }).status
  return !(status !== undefined && status >= 400 && status < 500) && failureCount < 3
}

export const usePikkuQuery = <Name extends keyof FlattenedRPCMap>(
  name: Name,
  data: FlattenedRPCMap[Name]['input'],
  options?: Omit<UseQueryOptions<FlattenedRPCMap[Name]['output'], Error>, 'queryKey' | 'queryFn'>
) => {
  const rpc = usePikkuRPC<{ invoke: RPCInvoke }>()
  return useQuery<FlattenedRPCMap[Name]['output'], Error>({
    queryKey: [name, data],
    queryFn: () => rpc.invoke(name, data),
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
    mutationFn: (data) => rpc.invoke(name, data),
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
