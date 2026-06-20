import { createContext, useContext, useMemo } from 'react'

import { pikku } from '../pikku/http'

const STORAGE_KEY = 'pikku-server-url'
const DEFAULT_SERVER_URL = 'http://localhost:4002'

export const getServerUrl = (): string => {
  try {
    const params = new URLSearchParams(window.location.search)
    const serverParam = params.get('server')
    if (serverParam) {
      localStorage.setItem(STORAGE_KEY, serverParam)
      return serverParam
    }
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_SERVER_URL
  } catch {
    return DEFAULT_SERVER_URL
  }
}

export const setServerUrl = (url: string) => {
  localStorage.setItem(STORAGE_KEY, url)
}

type PikkuInstance = ReturnType<typeof pikku>
type PikkuHTTP = PikkuInstance['fetch']
type PikkuRPCInstance = PikkuInstance['rpc']

const PikkuInstanceContext = createContext<PikkuInstance | null>(null)
const PikkuHTTPContext = createContext<PikkuHTTP | null>(null)
export const PikkuRPCContext = createContext<PikkuRPCInstance | null>(null)

export const PikkuHTTPProvider: React.FC<{
  children: React.ReactNode
  serverUrl?: string
  /**
   * Fetch credentials mode for the underlying instance (also used by
   * usePikkuSSE). Defaults to 'include' for the same-origin cookie-auth flow.
   * Set to 'omit'/'same-origin' for cross-origin bearer-token setups, where
   * 'include' + wildcard CORS is rejected by the browser at preflight.
   */
  credentials?: RequestCredentials
}> = ({ children, serverUrl, credentials = 'include' }) => {
  const resolvedUrl = serverUrl ?? getServerUrl()
  const pikkuInstance = useMemo(() => {
    return pikku({
      serverUrl: resolvedUrl,
      credentials,
    })
  }, [resolvedUrl, credentials])
  return (
    <PikkuInstanceContext.Provider value={pikkuInstance}>
      <PikkuHTTPContext.Provider value={pikkuInstance.fetch}>
        {children}
      </PikkuHTTPContext.Provider>
    </PikkuInstanceContext.Provider>
  )
}

export const PikkuRPCProvider: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  const pikkuInstance = useContext(PikkuInstanceContext)
  if (!pikkuInstance) {
    throw new Error('PikkuRPCProvider must be used within PikkuHTTPProvider')
  }
  return (
    <PikkuRPCContext.Provider value={pikkuInstance.rpc}>
      {children}
    </PikkuRPCContext.Provider>
  )
}

export const usePikkuHTTP = () => {
  const context = useContext(PikkuHTTPContext)
  if (!context) {
    throw new Error('usePikkuHTTP must be used within PikkuHTTPProvider')
  }
  return context
}

export const usePikkuRPC = () => {
  const context = useContext(PikkuRPCContext)
  if (!context) {
    throw new Error('usePikkuRPC must be used within PikkuRPCProvider')
  }
  return context
}

export const usePikkuSSE = () => {
  const context = useContext(PikkuInstanceContext)
  if (!context) {
    throw new Error('usePikkuSSE must be used within PikkuHTTPProvider')
  }
  return context.fetch.subscribeToSSE.bind(context.fetch) as <T = unknown>(
    path: string,
    handler: (event: T) => void,
    onError?: (err: unknown) => void
  ) => { close: () => void }
}
