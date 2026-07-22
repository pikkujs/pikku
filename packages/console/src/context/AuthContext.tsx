import { createContext, useContext, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createConsoleAuthClient,
  type ConsoleAuthClient,
} from '../lib/auth-client'
import { getServerUrl, setServerUrl as persistServerUrl } from './serverUrl'

export interface AuthUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
  role?: string | null
  banned?: boolean | null
  createdAt?: string | Date | null
}

export interface AuthContextValue {
  client: ConsoleAuthClient
  user: AuthUser | null
  /** True while the initial session fetch is in flight. */
  loading: boolean
  /** True once a session has been resolved (success or not). */
  isAdmin: boolean
  /** The pikku instance URL auth + RPC/meta point at (persisted in localStorage). */
  serverUrl: string
  /** Persist a new instance URL; rebuilds the auth client + refetches the session. */
  setServerUrl: (url: string) => void
  refetchSession: () => Promise<unknown>
  /** Sign in. Pass `nextServerUrl` to switch instance and authenticate against it in one step. */
  signIn: (
    email: string,
    password: string,
    nextServerUrl?: string
  ) => Promise<void>
  signOut: () => Promise<void>
  listUsers: (search?: string) => Promise<AuthUser[]>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESSION_QUERY_KEY = ['console-auth-session']

export const AuthProvider: React.FC<{
  children: React.ReactNode
  serverUrl?: string
}> = ({ children, serverUrl }) => {
  const [activeUrl, setActiveUrl] = useState(serverUrl ?? getServerUrl())
  const queryClient = useQueryClient()
  const client = useMemo(() => createConsoleAuthClient(activeUrl), [activeUrl])

  const sessionQuery = useQuery({
    queryKey: [...SESSION_QUERY_KEY, activeUrl],
    queryFn: async () => {
      const { data, error } = await client.getSession()
      if (error) {
        throw new Error(error.message ?? 'Failed to load session')
      }
      return data ?? null
    },
    retry: false,
  })

  const value = useMemo<AuthContextValue>(() => {
    const session = sessionQuery.data ?? null
    const user = (session?.user as AuthUser | undefined) ?? null

    const refetchSession = () =>
      queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })

    const setServerUrl = (url: string) => {
      persistServerUrl(url)
      setActiveUrl(url.trim().replace(/\/+$/, ''))
    }

    return {
      client,
      user,
      loading: sessionQuery.isLoading,
      isAdmin: user?.role === 'admin',
      serverUrl: activeUrl,
      setServerUrl,
      refetchSession,
      signIn: async (email, password, nextServerUrl) => {
        // When switching instance, authenticate against a fresh client for the
        // target URL synchronously (the memoized `client` only rebuilds next
        // render), then persist so the session query refetches against it.
        const normalizedNext = nextServerUrl?.trim().replace(/\/+$/, '')
        const switching = !!normalizedNext && normalizedNext !== activeUrl
        const authClient = switching
          ? createConsoleAuthClient(normalizedNext!)
          : client
        const { error } = await authClient.signIn.email({ email, password })
        if (error) {
          throw new Error(error.message ?? 'Sign in failed')
        }
        if (switching) {
          setServerUrl(normalizedNext!)
        }
        await refetchSession()
      },
      signOut: async () => {
        await client.signOut()
        await refetchSession()
      },
      listUsers: async (search) => {
        const { data, error } = await client.admin.listUsers({
          query: {
            limit: 200,
            ...(search
              ? {
                  searchField: 'email',
                  searchOperator: 'contains',
                  searchValue: search,
                }
              : {}),
          },
        })
        if (error) {
          throw new Error(error.message ?? 'Failed to list users')
        }
        return (data?.users ?? []) as AuthUser[]
      },
    }
  }, [client, sessionQuery.data, sessionQuery.isLoading, queryClient])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Throws if used outside an AuthProvider. Use in the standalone OSS console. */
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}

/**
 * Returns null when there is no AuthProvider — for shared primitives (e.g. the
 * Sidebar) that render in hosts (Fabric) which do not mount console auth.
 */
export const useOptionalAuth = (): AuthContextValue | null =>
  useContext(AuthContext)
