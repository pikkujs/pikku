import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

export function useWorkflowRuns(workflowName?: string, status?: string) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['workflow-runs', workflowName, status],
    queryFn: async () => {
      return await rpc('console:getWorkflowRuns', {
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

  return useQuery({
    queryKey: ['workflow-run', runId],
    queryFn: async () => {
      return await rpc('console:getWorkflowRun', { runId: runId! })
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      const data = query.state.data as any | undefined
      return data?.status === 'running' ? 1000 : false
    },
  })
}

export function useWorkflowRunSteps(runId: string | null) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['workflow-run-steps', runId],
    queryFn: async () => {
      return await rpc('console:getWorkflowRunSteps', { runId: runId! })
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined
      const hasActiveStep = data?.some(
        (s: any) => s.status === 'running' || s.status === 'pending'
      )
      return hasActiveStep ? 2000 : false
    },
  })
}

export function useWorkflowRunHistory(runId: string | null) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['workflow-run-history', runId],
    queryFn: async () => {
      return await rpc('console:getWorkflowRunHistory', { runId: runId! })
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
      return await rpc('console:getWorkflowVersion', {
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
    }) => rpc('startWorkflowRun', { workflowName, input }),
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
      return await rpc('console:getWorkflowRunNames', null)
    },
  })
}
