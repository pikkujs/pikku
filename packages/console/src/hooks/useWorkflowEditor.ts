import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

export function useGenerateWorkflowGraph() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      prompt,
      workflowName,
      functionFilter,
    }: {
      prompt: string
      workflowName?: string
      functionFilter?: string[]
    }) =>
      rpc.startWorkflow('dynamic-workflows:generateDynamicWorkflow', {
        prompt,
        name: workflowName,
        functionFilter: functionFilter?.length ? functionFilter : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
      queryClient.invalidateQueries({ queryKey: ['ai-workflows'] })
    },
  })
}
