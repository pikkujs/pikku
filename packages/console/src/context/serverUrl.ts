const STORAGE_KEY = 'pikku-server-url'
const FALLBACK_SERVER_URL = 'http://localhost:4002'

const normalizeServerUrl = (value: string): string => value.trim().replace(/\/+$/, '')

const getCurrentOrigin = (): string | null => {
  try {
    const origin = window.location.origin
    return origin ? normalizeServerUrl(origin) : null
  } catch {
    return null
  }
}

const getDefaultServerUrl = (): string => {
  return getCurrentOrigin() ?? FALLBACK_SERVER_URL
}

export const getServerUrl = (): string => {
  try {
    const params = new URLSearchParams(window.location.search)
    const serverParam = params.get('server')
    if (serverParam) {
      const normalized = normalizeServerUrl(serverParam)
      localStorage.setItem(STORAGE_KEY, normalized)
      return normalized
    }
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return getDefaultServerUrl()
    }
    const normalizedStored = normalizeServerUrl(stored)
    const currentOrigin = getCurrentOrigin()
    if (
      normalizedStored === FALLBACK_SERVER_URL &&
      currentOrigin &&
      currentOrigin !== FALLBACK_SERVER_URL
    ) {
      localStorage.setItem(STORAGE_KEY, currentOrigin)
      return currentOrigin
    }
    return normalizedStored
  } catch {
    return getDefaultServerUrl()
  }
}

export const setServerUrl = (url: string) => {
  localStorage.setItem(STORAGE_KEY, normalizeServerUrl(url))
}

// Better Auth's default base path. Pikku backends mount Better Auth here, and
// the sandbox Caddy preserves `/api/auth/*` to match it.
export const AUTH_BASE_PATH = '/api/auth'
