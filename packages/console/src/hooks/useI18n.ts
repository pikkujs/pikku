import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

export type I18nCatalog = Record<string, string>

export interface I18nApp {
  app: string
  messagesDir: string
  baseLocale: string
  defaultLocale: string | null
  locales: Record<string, I18nCatalog>
}

/** Prefixes copy seeded from the base locale that nobody has translated yet. */
export const MISSING_MARKER = '%i18n-missing%'

const KEY = ['console:getI18n']

export function useI18nApps() {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: KEY,
    queryFn: async () =>
      ((await rpc.invoke('console:getI18n')) as { apps: I18nApp[] }).apps,
  })
}

function useI18nMutation<In>(rpcName: string) {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: In) =>
      await rpc.invoke(rpcName as never, input as never),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

export const useWriteI18nLocale = () =>
  useI18nMutation<{ app: string; locale: string; content: I18nCatalog }>(
    'console:writeI18nLocale'
  )
export const useAddI18nLocale = () =>
  useI18nMutation<{ app: string; locale: string }>('console:addI18nLocale')
export const useDeleteI18nLocale = () =>
  useI18nMutation<{ app: string; locale: string }>('console:deleteI18nLocale')
export const useSetI18nDefaultLocale = () =>
  useI18nMutation<{ app: string; locale: string }>(
    'console:setI18nDefaultLocale'
  )
export const useSyncI18n = () =>
  useI18nMutation<{ app?: string }>('console:syncI18n')
