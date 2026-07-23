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

/**
 * The whole addon catalogue as one flat array, for the canvas drawer — which
 * matches wired functions against every addon and so genuinely needs all of
 * them. `console:getAddonMeta` is paged (the gallery scrolls it), so the walk
 * lives here rather than being repeated by each backend's RPC adapter.
 *
 * The gallery must NOT use this: it wants one page at a time.
 */
export function useAddonMeta() {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['addon', 'meta'],
    queryFn: async () => {
      const addons = []
      let cursor: number | undefined
      // Bounded so a backend that always echoes a cursor can't spin forever.
      for (let page = 0; page < 100; page++) {
        const result = await rpc.invoke('console:getAddonMeta', {
          limit: 250,
          ...(cursor != null ? { cursor } : {}),
        })
        addons.push(...(result?.packages ?? []))
        if (result?.nextCursor == null) break
        cursor = result.nextCursor
      }
      return addons
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
