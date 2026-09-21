export const serializeReactQueryHooks = (
  rpcMapPath: string,
  workflowMapPath?: string,
  auth?: { statelessCookie: boolean }
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
   * The session, and — on the stateless path — the thing that keeps it alive.
   *
   * `betterAuthStatelessSession` verifies the signed `session_data` cookie with
   * the secret alone, with no database behind it, and nothing rewrites that
   * cookie once someone is signed in. So the session ends when the cookie does,
   * however long the `session_token` still had. A query that re-reads the
   * session on an interval re-mints it as a side effect, which is why this is
   * `useSession` and not a refresh loop bolted on beside it: the app wants the
   * session anyway, and refetching is already what react-query does.
   *
   * `disableCookieCache=true` is load-bearing, and only on the stateless path.
   * Without it `/get-session` sees a valid cache and hands it straight back
   * without touching the cookie; the branch that would extend it in place is
   * governed by `cookieRefreshCache`, which better-auth forces to `false`
   * whenever a database is configured. With it, better-auth reads the session
   * from the database and writes a new cookie with a full `maxAge`. That read
   * is the point rather than the cost: the database is where a ban or a revoked
   * session is recorded, so each refetch is the moment those take effect.
   */
  const sessionPath = auth?.statelessCookie
    ? '/auth/get-session?disableCookieCache=true'
    : '/auth/get-session'

  const sessionImport = auth ? ', usePikkuFetch' : ''

  const sessionHook = auth
    ? `
/* Comfortably inside any cookie lifetime worth configuring, and one GET every
   ten minutes is nothing beside what an open app does anyway. */
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
      const response = await fetch.fetch('${sessionPath}', 'GET', undefined)
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

export const usePikkuQuery = <Name extends keyof FlattenedRPCMap>(
  name: Name,
  data: FlattenedRPCMap[Name]['input'],
  options?: Omit<UseQueryOptions<FlattenedRPCMap[Name]['output'], Error>, 'queryKey' | 'queryFn'>
) => {
  const rpc = usePikkuRPC<{ invoke: RPCInvoke }>()
  return useQuery<FlattenedRPCMap[Name]['output'], Error>({
    queryKey: [name, data],
    queryFn: () => rpc.invoke(name, data),
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
