import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { usePikkuImpersonatedRPC } from '../context/ImpersonationContext'
import {
  workflowQueryKeys,
  isRunActive,
  hasActiveStep,
} from './workflow-query-keys'

export interface WorkflowRunData {
  runId: string
  workflow: string
  status: string
  input?: unknown
  output?: Record<string, unknown>
  /**
   * A suspended run also carries an `error` — core stores the suspend reason in
   * this field with `code: 'WORKFLOW_SUSPENDED'` or `'RPC_NOT_FOUND'`. Read
   * `code` before presenting this as a failure; see {@link isSuspendReason}.
   */
  error?: { message: string; code?: string }
  startedAt?: string
  completedAt?: string
  graphHash?: string
}

export interface WorkflowStepData {
  stepId: string
  stepName: string
  rpcName?: string
  status: string
  startedAt?: string
  completedAt?: string
  duration?: number
  result?: unknown
  error?: { message: string }
}

export function useWorkflowRuns(workflowName?: string, status?: string) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: workflowQueryKeys.runs(workflowName, status),
    queryFn: async () => {
      return await rpc.invoke('console:getWorkflowRuns', {
        workflowName,
        status,
        limit: 50,
        offset: 0,
      })
    },
    enabled: !!workflowName,
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined
      const hasActiveRun = data?.some((r: any) => isRunActive(r.status))
      return hasActiveRun ? 5000 : false
    },
  })
}

export function useWorkflowRun(runId: string | null) {
  const rpc = usePikkuRPC()

  return useQuery<WorkflowRunData | null>({
    queryKey: workflowQueryKeys.run(runId),
    queryFn: async () => {
      return (await rpc.invoke('console:getWorkflowRun', {
        runId: runId!,
      })) as unknown as WorkflowRunData
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      return isRunActive(query.state.data?.status) ? 3000 : false
    },
  })
}

export function useWorkflowRunSteps(runId: string | null) {
  const rpc = usePikkuRPC()

  return useQuery<WorkflowStepData[]>({
    queryKey: workflowQueryKeys.runSteps(runId),
    queryFn: async () => {
      return (await rpc.invoke('console:getWorkflowRunSteps', {
        runId: runId!,
      })) as WorkflowStepData[]
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      return hasActiveStep(query.state.data) ? 3000 : false
    },
  })
}

export function useWorkflowRunHistory(runId: string | null) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: workflowQueryKeys.runHistory(runId),
    queryFn: async () => {
      return await rpc.invoke('console:getWorkflowRunHistory', {
        runId: runId!,
      })
    },
    enabled: !!runId,
  })
}

export function useWorkflowVersion(
  name: string | null,
  graphHash: string | null
) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: workflowQueryKeys.version(name, graphHash),
    queryFn: async () => {
      return await rpc.invoke('console:getWorkflowVersion', {
        name: name!,
        graphHash: graphHash!,
      })
    },
    enabled: !!name && !!graphHash,
  })
}

export function useStartWorkflowRun() {
  const rpc = usePikkuImpersonatedRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      workflowName,
      input,
    }: {
      workflowName: string
      input?: any
    }) => rpc.startWorkflow(workflowName as never, input as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.allRuns() })
    },
  })
}

export function useWorkflowRunNames() {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: workflowQueryKeys.runNames(),
    queryFn: async () => {
      return await rpc.invoke('console:getWorkflowRunNames')
    },
  })
}

export function useAIWorkflows() {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: workflowQueryKeys.aiWorkflows(),
    queryFn: async () => {
      return await rpc.invoke('console:getAIWorkflows', {})
    },
  })
}

/**
 * Invalidates the workflow-run queries the panels read from.
 *
 * Exists for embedders that learn a run has moved on from outside this package
 * and need the panels to catch up. Without it the only option is to hardcode
 * the key tuples against a QueryClient, which couples the host to internals
 * that are free to change.
 */
export function useWorkflowRunRefresh() {
  const queryClient = useQueryClient()

  const refreshRun = useCallback(
    (runId: string) => {
      queryClient.invalidateQueries({
        queryKey: workflowQueryKeys.run(runId),
        exact: true,
      })
      queryClient.invalidateQueries({
        queryKey: workflowQueryKeys.runSteps(runId),
        exact: true,
      })
      queryClient.invalidateQueries({
        queryKey: workflowQueryKeys.runHistory(runId),
        exact: true,
      })
    },
    [queryClient]
  )

  const refreshRuns = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: workflowQueryKeys.allRuns() })
  }, [queryClient])

  const refreshAll = useCallback(
    (runId: string) => {
      refreshRun(runId)
      refreshRuns()
    },
    [refreshRun, refreshRuns]
  )

  return { refreshRun, refreshRuns, refreshAll }
}
