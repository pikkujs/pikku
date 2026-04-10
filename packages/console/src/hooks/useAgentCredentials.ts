import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

interface AgentCredentialRequirement {
  credentialName: string
  displayName: string
  addonNamespace: string
  connected: boolean
}

interface AgentCredentialCheckResult {
  requirements: AgentCredentialRequirement[]
  allConnected: boolean
}

export function useAgentCredentials(agentName?: string) {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-credentials', agentName],
    queryFn: async (): Promise<AgentCredentialCheckResult> => {
      return await rpc.invoke('console:agentCredentialCheck', {
        agentName: agentName!,
      })
    },
    enabled: !!agentName,
  })

  const refetch = () => {
    queryClient.invalidateQueries({
      queryKey: ['agent-credentials', agentName],
    })
  }

  return {
    requirements: query.data?.requirements ?? [],
    allConnected: query.data?.allConnected ?? true,
    loading: query.isLoading,
    error: query.error,
    isError: query.isError,
    refetch,
  }
}
