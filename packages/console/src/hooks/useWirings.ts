import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { useMemo } from 'react'

export function useChannelSnippets(channelName: string) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['channel', 'snippets', channelName],
    queryFn: async () => {
      return await rpc('console:getChannelSnippets', { channelName })
    },
    enabled: !!channelName,
  })
}

export function useFunctionsMeta() {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ['functions', 'meta'],
    queryFn: async () => {
      return await rpc('console:getFunctionsMeta', null)
    },
  })
}

export function useFunctionMeta(pikkuFuncId: string) {
  const { isLoading, isError, data: functionsMeta } = useFunctionsMeta()

  const funcMeta = useMemo(() => {
    return functionsMeta?.find((f: any) => f.name === pikkuFuncId) || null
  }, [functionsMeta, pikkuFuncId])

  return {
    data: funcMeta,
    isLoading,
    isError,
  }
}

export function useExternalMeta() {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['external', 'meta'],
    queryFn: async () => {
      const x = await rpc('console:getExternalMeta', null)
      return x
    },
  })
}

export function useSchema(schemaName: string | null | undefined) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['schema', schemaName],
    queryFn: async () => {
      if (!schemaName) return null

      return await rpc('console:getSchema', { schemaName })
    },
    enabled: !!schemaName,
  })
}

export function useOutputSchema(rpcName: string | null | undefined) {
  const { data: funcMeta } = useFunctionMeta(rpcName || '')
  const outputSchemaName = funcMeta?.outputSchemaName

  return useSchema(outputSchemaName)
}
