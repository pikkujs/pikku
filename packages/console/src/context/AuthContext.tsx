import { createContext, useContext, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { hasScopes } from '@pikku/core'
import {
  createConsoleAuthClient,
  type ConsoleAuthClient,
} from '../lib/auth-client'
import { usePikkuRPC } from './PikkuRpcProvider'
import { getServerUrl, setServerUrl as persistServerUrl } from './serverUrl'

export interface AuthUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
  createdAt?: string | Date | null
  /**
   * Ban state, owned by better-auth's `admin()` plugin. Undefined when the host
   * does not wire it — distinct from `false`, so the UI can leave the column out
   * entirely rather than claiming everyone is in good standing.
   */
  banned?: boolean
  banReason?: string | null
  banExpires?: string | null
}

export interface AuthContextValue {
  client: ConsoleAuthClient
  user: AuthUser | null
  /** True while the initial session or scope fetch is in flight. */
  loading: boolean
  /** The scopes the caller's session carries, from `console:getMyAccess`. */
  scopes: string[]
  /**
   * Whether the caller holds `scope`, honouring pikku's parent-grant rule — a
   * user holding `admin` satisfies `admin:impersonate`. Prefer this over
   * {@link AuthContextValue.isAdmin} wherever a specific capability is what
   * actually matters.
   */
  can: (scope: string) => boolean
  /** Whether the caller holds the umbrella `admin` scope. */
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
  /**
   * The user directory and the actions on it, each gated on its own
   * `admin:users:*` scope.
   *
   * These live in the *host app's* scaffold (`scaffold.userAdmin`), not in the
   * console addon — listing or banning a user is ordinary application behaviour
   * and must not require running a console. A host that has not scaffolded them
   * has no such RPC and no such scopes, so `can(...)` returns false and the UI
   * leaves the actions out entirely.
   */
  listUsers: (search?: string) => Promise<AuthUser[]>
  createUser: (input: {
    email: string
    password: string
    name?: string
  }) => Promise<void>
  setUserBanned: (input: {
    userId: string
    banned: boolean
    reason?: string
    expiresInSeconds?: number
  }) => Promise<void>
  removeUser: (userId: string) => Promise<void>
  revokeUserSessions: (userId: string) => Promise<void>
  setUserPassword: (userId: string, newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * The user-management RPCs the host app scaffolds. They cannot appear in the
 * console's `RPCMap`, which only knows the console addon's own functions, so
 * the name is passed untyped — the payloads are pinned by
 * {@link AuthContextValue} instead.
 */
const USER_ADMIN_RPC = {
  list: 'pikkuAdminListUsers',
  create: 'pikkuAdminCreateUser',
  setBanned: 'pikkuAdminSetUserBanned',
  remove: 'pikkuAdminRemoveUser',
  revokeSessions: 'pikkuAdminRevokeUserSessions',
  setPassword: 'pikkuAdminSetUserPassword',
} as const

const SESSION_QUERY_KEY = ['console-auth-session']
const ACCESS_QUERY_KEY = ['console-auth-access']

export const AuthProvider: React.FC<{
  children: React.ReactNode
  serverUrl?: string
}> = ({ children, serverUrl }) => {
  const [activeUrl, setActiveUrl] = useState(serverUrl ?? getServerUrl())
  const queryClient = useQueryClient()
  const rpc = usePikkuRPC()
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

  const userId = (sessionQuery.data?.user as AuthUser | undefined)?.id ?? null

  const accessQuery = useQuery({
    queryKey: [...ACCESS_QUERY_KEY, activeUrl, userId],
    queryFn: async () =>
      (await rpc.invoke('console:getMyAccess')) as {
        userId: string
        scopes: string[]
      },
    enabled: !!userId,
    retry: false,
  })

  const value = useMemo<AuthContextValue>(() => {
    const invokeUserAdmin = (name: string, data: unknown) =>
      (rpc.invoke as (name: string, data: unknown) => Promise<unknown>)(
        name,
        data
      )

    const session = sessionQuery.data ?? null
    const user = (session?.user as AuthUser | undefined) ?? null
    const scopes = accessQuery.data?.scopes ?? []
    const can = (scope: string) => hasScopes([scope], scopes)

    const refetchSession = () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ACCESS_QUERY_KEY }),
      ])

    const setServerUrl = (url: string) => {
      persistServerUrl(url)
      setActiveUrl(url.trim().replace(/\/+$/, ''))
    }

    return {
      client,
      user,
      // Scopes arrive a round-trip after the session, so a gate that reads
      // `isAdmin` must keep waiting or it flashes not-authorized at every
      // admin who is in fact authorized.
      loading: sessionQuery.isLoading || (!!userId && accessQuery.isLoading),
      scopes,
      can,
      isAdmin: hasScopes(['admin'], scopes),
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
        const { users } = (await invokeUserAdmin(USER_ADMIN_RPC.list, {
          ...(search ? { search } : {}),
        })) as { users: AuthUser[] }
        return users
      },
      createUser: async (input) => {
        await invokeUserAdmin(USER_ADMIN_RPC.create, input)
      },
      setUserBanned: async (input) => {
        await invokeUserAdmin(USER_ADMIN_RPC.setBanned, input)
      },
      removeUser: async (userId) => {
        await invokeUserAdmin(USER_ADMIN_RPC.remove, { userId })
      },
      revokeUserSessions: async (userId) => {
        await invokeUserAdmin(USER_ADMIN_RPC.revokeSessions, { userId })
      },
      setUserPassword: async (userId, newPassword) => {
        await invokeUserAdmin(USER_ADMIN_RPC.setPassword, {
          userId,
          newPassword,
        })
      },
    }
  }, [
    client,
    rpc,
    userId,
    sessionQuery.data,
    sessionQuery.isLoading,
    accessQuery.data,
    accessQuery.isLoading,
    queryClient,
  ])

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
