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

export function useGenerateWorkflowBody() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      sourceFile,
      exportedName,
      prompt,
    }: {
      sourceFile: string
      exportedName: string
      prompt: string
    }) =>
      (rpc as any).invoke('console:generateWorkflowBody', {
        sourceFile,
        exportedName,
        prompt,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
      queryClient.invalidateQueries({ queryKey: ['function-source'] })
    },
  })
}
