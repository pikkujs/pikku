import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { pikku } from '../pikku/http'
import { getServerUrl } from './serverUrl'
import { useOptionalAuth, type AuthUser } from './AuthContext'
import { usePikkuRPC, usePikkuHTTP } from './PikkuRpcProvider'

export const IMPERSONATE_HEADER = 'x-pikku-impersonate-user-id'

type PikkuInstance = ReturnType<typeof pikku>

export interface ImpersonationContextValue {
  target: AuthUser | null
  setTarget: (user: AuthUser | null) => void
  clear: () => void
  instance: PikkuInstance
}

const ImpersonationContext = createContext<ImpersonationContextValue | null>(
  null
)

export const ImpersonationProvider: React.FC<{
  children: React.ReactNode
  serverUrl?: string
  credentials?: RequestCredentials
}> = ({ children, serverUrl, credentials = 'include' }) => {
  const auth = useOptionalAuth()
  const resolvedUrl = serverUrl ?? auth?.serverUrl ?? getServerUrl()
  const [target, setTarget] = useState<AuthUser | null>(null)

  const instance = useMemo(
    () => pikku({ serverUrl: resolvedUrl, credentials }),
    [resolvedUrl, credentials]
  )

  useEffect(() => {
    instance.fetch.setHeader(IMPERSONATE_HEADER, target?.id ?? null)
  }, [instance, target])

  useEffect(() => {
    setTarget(null)
  }, [resolvedUrl])

  const value = useMemo<ImpersonationContextValue>(
    () => ({
      target,
      setTarget,
      clear: () => setTarget(null),
      instance,
    }),
    [target, instance]
  )

  return (
    <ImpersonationContext.Provider value={value}>
      {children}
    </ImpersonationContext.Provider>
  )
}

export const useOptionalImpersonation = (): ImpersonationContextValue | null =>
  useContext(ImpersonationContext)

export const useImpersonation = (): ImpersonationContextValue => {
  const ctx = useContext(ImpersonationContext)
  if (!ctx) {
    throw new Error(
      'useImpersonation must be used within an ImpersonationProvider'
    )
  }
  return ctx
}

export const usePikkuImpersonatedRPC = () => {
  const imp = useOptionalImpersonation()
  const fallback = usePikkuRPC()
  return imp ? imp.instance.rpc : fallback
}

export const usePikkuImpersonatedHTTP = () => {
  const imp = useOptionalImpersonation()
  const fallback = usePikkuHTTP()
  return imp ? imp.instance.fetch : fallback
}

export const usePikkuImpersonatedSSE = () => {
  const imp = useOptionalImpersonation()
  const fallbackFetch = usePikkuHTTP()
  const fetch = imp ? imp.instance.fetch : fallbackFetch
  return fetch.subscribeToSSE.bind(fetch) as <T = unknown>(
    path: string,
    handler: (event: T) => void,
    onError?: (err: unknown) => void
  ) => { close: () => void }
}
