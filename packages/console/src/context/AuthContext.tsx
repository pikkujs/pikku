import { createContext, useContext, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createConsoleAuthClient,
  type ConsoleAuthClient,
} from '../lib/auth-client'
import { getServerUrl } from './serverUrl'

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
  /** The admin user id when the current session is an impersonation, else null. */
  impersonatedBy: string | null
  refetchSession: () => Promise<unknown>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  listUsers: (search?: string) => Promise<AuthUser[]>
  /** Impersonate a user, then reload so all RPC/meta refetch as them. */
  impersonate: (userId: string) => Promise<void>
  stopImpersonating: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESSION_QUERY_KEY = ['console-auth-session']

export const AuthProvider: React.FC<{
  children: React.ReactNode
  serverUrl?: string
}> = ({ children, serverUrl }) => {
  const resolvedUrl = serverUrl ?? getServerUrl()
  const queryClient = useQueryClient()
  const client = useMemo(
    () => createConsoleAuthClient(resolvedUrl),
    [resolvedUrl]
  )

  const sessionQuery = useQuery({
    queryKey: [...SESSION_QUERY_KEY, resolvedUrl],
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
    const impersonatedBy =
      (session?.session as { impersonatedBy?: string | null } | undefined)
        ?.impersonatedBy ?? null

    const refetchSession = () =>
      queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })

    return {
      client,
      user,
      loading: sessionQuery.isLoading,
      isAdmin: user?.role === 'admin',
      impersonatedBy,
      refetchSession,
      signIn: async (email, password) => {
        const { error } = await client.signIn.email({ email, password })
        if (error) {
          throw new Error(error.message ?? 'Sign in failed')
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
      impersonate: async (userId) => {
        const { error } = await client.admin.impersonateUser({ userId })
        if (error) {
          throw new Error(error.message ?? 'Failed to impersonate user')
        }
        // Reload so the Pikku RPC/meta layer re-fetches under the new session
        // cookie — the whole console now runs as the impersonated user.
        window.location.reload()
      },
      stopImpersonating: async () => {
        const { error } = await client.admin.stopImpersonating()
        if (error) {
          throw new Error(error.message ?? 'Failed to stop impersonating')
        }
        window.location.reload()
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
