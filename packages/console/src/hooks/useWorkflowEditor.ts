import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

export function useCreateWorkflow() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      name,
      description,
    }: {
      name: string
      description?: string
    }) => (rpc as any).invoke('console:createWorkflow', { name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
    },
  })
}

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
      (rpc as any).invoke('console:generateWorkflowGraph', {
        prompt,
        workflowName,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
      queryClient.invalidateQueries({ queryKey: ['ai-workflows'] })
    },
  })
}
