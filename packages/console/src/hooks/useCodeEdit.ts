import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'

export function useFunctionSource(
  sourceFile: string | undefined,
  exportedName: string | undefined,
  enabled: boolean
) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['function-source', sourceFile, exportedName],
    queryFn: async () => {
      return await rpc.invoke('console:readFunctionSource', {
        sourceFile: sourceFile!,
        exportedName: exportedName!,
      })
    },
    enabled: !!sourceFile && !!exportedName && enabled,
  })
}

export function useUpdateFunctionConfig() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      sourceFile,
      exportedName,
      changes,
    }: {
      sourceFile: string
      exportedName: string
      changes: Record<string, unknown>
    }) =>
      rpc.invoke('console:updateFunctionConfig', {
        sourceFile,
        exportedName,
        changes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['functions'] })
      queryClient.invalidateQueries({ queryKey: ['function-source'] })
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
    },
  })
}

export function useFunctionBody(
  sourceFile: string | undefined,
  exportedName: string | undefined,
  enabled: boolean
) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['function-body', sourceFile, exportedName],
    queryFn: async () => {
      return await rpc.invoke('console:readFunctionBody', {
        sourceFile: sourceFile!,
        exportedName: exportedName!,
      })
    },
    enabled: !!sourceFile && !!exportedName && enabled,
  })
}

export function useUpdateFunctionBody() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      sourceFile,
      exportedName,
      body,
    }: {
      sourceFile: string
      exportedName: string
      body: string
    }) =>
      rpc.invoke('console:updateFunctionBody', {
        sourceFile,
        exportedName,
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['functions'] })
      queryClient.invalidateQueries({ queryKey: ['function-body'] })
      queryClient.invalidateQueries({ queryKey: ['function-source'] })
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
    },
  })
}

export function useAgentSource(
  sourceFile: string | undefined,
  exportedName: string | undefined,
  enabled: boolean
) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['agent-source', sourceFile, exportedName],
    queryFn: async () => {
      return await rpc.invoke('console:readAgentSource', {
        sourceFile: sourceFile!,
        exportedName: exportedName!,
      })
    },
    enabled: !!sourceFile && !!exportedName && enabled,
  })
}

export function useUpdateAgentConfig() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      sourceFile,
      exportedName,
      changes,
    }: {
      sourceFile: string
      exportedName: string
      changes: Record<string, unknown>
    }) =>
      rpc.invoke('console:updateAgentConfig', {
        sourceFile,
        exportedName,
        changes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
      queryClient.invalidateQueries({ queryKey: ['agent-source'] })
    },
  })
}
