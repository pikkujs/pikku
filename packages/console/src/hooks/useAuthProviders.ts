import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

export interface AuthProviderEntry {
  id: string
  displayName: string
  secretId: string
}

export interface AuthPluginEntry {
  id: string
  displayName: string
}

export interface AuthProvidersMeta {
  providers: AuthProviderEntry[]
  plugins: AuthPluginEntry[]
  hasCredentials: boolean
}

const EMPTY_META: AuthProvidersMeta = {
  providers: [],
  plugins: [],
  hasCredentials: false,
}

export function useAuthProviders(): {
  meta: AuthProvidersMeta
  isLoading: boolean
} {
  const rpc = usePikkuRPC()

  // `placeholderData` (not `initialData`) supplies an empty default while the
  // query loads without marking it fresh — `initialData` combined with the
  // app-wide `staleTime` would suppress the fetch entirely.
  const { data, isLoading } = useQuery({
    queryKey: ['auth-providers'],
    queryFn: async () => {
      return (await rpc.invoke('console:getAuthProviders')) as AuthProvidersMeta
    },
    placeholderData: EMPTY_META,
  })

  return { meta: data ?? EMPTY_META, isLoading }
}
