import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

export function useAgentThreads(agentName?: string, polling = true) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['agent-threads', agentName],
    queryFn: async () => {
      return await rpc.invoke('console:getAgentThreads', {
        agentName,
        limit: 50,
        offset: 0,
      })
    },
    enabled: !!agentName,
    refetchInterval: polling ? 5000 : false,
  })
}

export function useAgentThreadMessages(
  threadId: string | null,
  polling = true
) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['agent-thread-messages', threadId],
    queryFn: async () => {
      return await rpc.invoke('console:getAgentThreadMessages', {
        threadId: threadId!,
      })
    },
    enabled: !!threadId,
    refetchInterval: polling ? 5000 : false,
  })
}

export function useAgentThreadRuns(threadId: string | null) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['agent-thread-runs', threadId],
    queryFn: async () => {
      return await rpc.invoke('console:getAgentThreadRuns', {
        threadId: threadId!,
      })
    },
    enabled: !!threadId,
  })
}

export function useDeleteAgentThread() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (threadId: string) => {
      return await rpc.invoke('console:deleteAgentThread', { threadId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-threads'] })
    },
  })
}
