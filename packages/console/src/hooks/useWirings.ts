import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { useMemo } from 'react'

type EmailPreviewValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | Array<unknown>

export function useChannelSnippets(channelName: string) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['channel', 'snippets', channelName],
    queryFn: async () => {
      return await rpc.invoke('console:getChannelSnippets', { channelName })
    },
    enabled: !!channelName,
  })
}

export function useFunctionsMeta() {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ['functions', 'meta'],
    queryFn: async () => {
      return await rpc.invoke('console:getFunctionsMeta')
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

export function useAddonMeta() {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['addon', 'meta'],
    queryFn: async () => {
      const x = await rpc.invoke('console:getAddonMeta')
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

      return await rpc.invoke('console:getSchema', { schemaName })
    },
    enabled: !!schemaName,
  })
}

export function useOutputSchema(rpcName: string | null | undefined) {
  const { data: funcMeta } = useFunctionMeta(rpcName || '')
  const outputSchemaName = funcMeta?.outputSchemaName

  return useSchema(outputSchemaName)
}

export function useRenderEmailPreview(
  templateName: string | null | undefined,
  locale: string | null | undefined,
  data: Record<string, EmailPreviewValue>,
  enabled = true
) {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['emails', 'preview', templateName, locale, JSON.stringify(data)],
    queryFn: async () => {
      if (!templateName) return null

      return await rpc.invoke('console:renderEmailPreview', {
        templateName,
        locale: locale ?? undefined,
        data,
      })
    },
    enabled: enabled && !!templateName,
  })
}
