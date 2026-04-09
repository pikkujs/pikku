import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

export function useGenerateAgent() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      prompt,
      agentName,
      functionFilter,
      allowSubAgents,
    }: {
      prompt: string
      agentName?: string
      functionFilter?: string[]
      allowSubAgents?: boolean
    }) =>
      (rpc as any).startWorkflow('code-assistant:generateDynamicAgent', {
        prompt,
        name: agentName,
        functionFilter: functionFilter?.length ? functionFilter : undefined,
        allowSubAgents,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
      queryClient.invalidateQueries({ queryKey: ['ai-workflows'] })
    },
  })
}
