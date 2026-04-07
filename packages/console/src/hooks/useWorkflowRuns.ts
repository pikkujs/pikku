import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

export interface WorkflowRunData {
  runId: string
  workflow: string
  status: string
  input?: unknown
  output?: Record<string, unknown>
  error?: { message: string }
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
  error?: { message: string }
}

export function useWorkflowRuns(workflowName?: string, status?: string) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['workflow-runs', workflowName, status],
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
      const hasActiveRun = data?.some((r: any) => r.status === 'running')
      return hasActiveRun ? 5000 : false
    },
  })
}

export function useWorkflowRun(runId: string | null) {
  const rpc = usePikkuRPC()

  return useQuery<WorkflowRunData | null>({
    queryKey: ['workflow-run', runId],
    queryFn: async () => {
      return (await rpc.invoke('console:getWorkflowRun', {
        runId: runId!,
      })) as unknown as WorkflowRunData
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      return query.state.data?.status === 'running' ? 3000 : false
    },
  })
}

export function useWorkflowRunSteps(runId: string | null) {
  const rpc = usePikkuRPC()

  return useQuery<WorkflowStepData[]>({
    queryKey: ['workflow-run-steps', runId],
    queryFn: async () => {
      return (await rpc.invoke('console:getWorkflowRunSteps', {
        runId: runId!,
      })) as WorkflowStepData[]
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      const hasActiveStep = query.state.data?.some(
        (s) => s.status === 'running' || s.status === 'pending'
      )
      return hasActiveStep ? 3000 : false
    },
  })
}

export function useWorkflowRunHistory(runId: string | null) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['workflow-run-history', runId],
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
    queryKey: ['workflow-version', name, graphHash],
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
  const rpc = usePikkuRPC()
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
      queryClient.invalidateQueries({ queryKey: ['workflow-runs'] })
    },
  })
}

export function useWorkflowRunNames() {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['workflow-run-names'],
    queryFn: async () => {
      return await rpc.invoke('console:getWorkflowRunNames', null)
    },
  })
}

export function useAIWorkflows() {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['ai-workflows'],
    queryFn: async () => {
      return await rpc.invoke('console:getAIWorkflows', {})
    },
  })
}
