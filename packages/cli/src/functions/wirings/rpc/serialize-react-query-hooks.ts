export const serializeReactQueryHooks = (
  rpcMapPath: string,
  workflowMapPath?: string
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
  runId: string,
  options?: Omit<UseQueryOptions<WorkflowRunStatus, Error>, 'queryKey' | 'queryFn'>
) => {
  const rpc = usePikkuRPC<{ workflowStatus: (name: string, runId: string) => Promise<WorkflowRunStatus> }>()
  return useQuery<WorkflowRunStatus, Error>({
    queryKey: ['workflowStatus', workflowName, runId],
    queryFn: () => rpc.workflowStatus(workflowName, runId),
    enabled: !!runId,
    ...options,
  })
}
`
    : ''

  return `import { useQuery, useMutation, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query'
import { usePikkuRPC } from '@pikku/react'
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
${workflowHooks}`
}
