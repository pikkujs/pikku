import { createContext, useContext, useMemo } from 'react'

import { pikku } from '@/pikku/http'

const STORAGE_KEY = 'pikku-server-url'
const DEFAULT_SERVER_URL = 'http://localhost:4002'

export const getServerUrl = (): string => {
  try {
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
const PikkuRPCContext = createContext<PikkuRPCInstance | null>(null)

export const PikkuHTTPProvider: React.FunctionComponent<{
  children: React.ReactNode
}> = ({ children }) => {
  const pikkuInstance = useMemo(() => {
    return pikku({
      serverUrl: getServerUrl(),
      credentials: 'include',
    })
  }, [])
  return (
    <PikkuInstanceContext.Provider value={pikkuInstance}>
      <PikkuHTTPContext.Provider value={pikkuInstance.fetch}>
        {children}
      </PikkuHTTPContext.Provider>
    </PikkuInstanceContext.Provider>
  )
}

export const PikkuRPCProvider: React.FunctionComponent<{
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
