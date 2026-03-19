import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { pikku } from '@/pikku/http'

const STORAGE_KEY = 'pikku-server-url'
const FALLBACK_URLS = [
  'http://localhost:4002',
  'http://localhost:4003',
]

export const getServerUrl = (): string => {
  try {
    const params = new URLSearchParams(window.location.search)
    const serverParam = params.get('server')
    if (serverParam) {
      localStorage.setItem(STORAGE_KEY, serverParam)
      return serverParam
    }
    return localStorage.getItem(STORAGE_KEY) || `${window.location.protocol}//${window.location.host}`
  } catch {
    return FALLBACK_URLS[0]
  }
}

export const discoverServerUrl = async (): Promise<string> => {
  const stored = getServerUrl()
  if (await probeServer(stored)) {
    return stored
  }
  for (const url of FALLBACK_URLS) {
    if (url !== stored && await probeServer(url)) {
      localStorage.setItem(STORAGE_KEY, url)
      return url
    }
  }
  return stored
}

const probeServer = async (url: string): Promise<boolean> => {
  try {
    const res = await fetch(`${url}/health-check`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
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
  serverUrl?: string
  autoDiscover?: boolean
}> = ({ children, serverUrl, autoDiscover = true }) => {
  const [resolvedUrl, setResolvedUrl] = useState<string>(serverUrl ?? getServerUrl())
  const [discovering, setDiscovering] = useState(!serverUrl && autoDiscover)

  useEffect(() => {
    if (serverUrl || !autoDiscover) return
    let cancelled = false
    discoverServerUrl().then((url) => {
      if (!cancelled) {
        setResolvedUrl(url)
        setDiscovering(false)
      }
    })
    return () => { cancelled = true }
  }, [serverUrl, autoDiscover])

  const pikkuInstance = useMemo(() => {
    return pikku({
      serverUrl: resolvedUrl,
      credentials: 'include',
    })
  }, [resolvedUrl])

  if (discovering) return null

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
