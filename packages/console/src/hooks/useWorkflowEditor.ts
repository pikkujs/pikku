import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

export function useGenerateWorkflowGraph() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      prompt,
      workflowName,
    }: {
      prompt: string
      workflowName: string
    }) =>
      (rpc as any).invoke('dynamic-workflows:generateDynamicWorkflow', {
        prompt,
        name: workflowName,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
      queryClient.invalidateQueries({ queryKey: ['ai-workflows'] })
    },
  })
}
