import { AUTH_BASE_PATH } from '../context/serverUrl'

export interface DevQuickLoginStatus {
  enabled: boolean
  email: string
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

export const isLocalServerUrl = (serverUrl: string): boolean => {
  try {
    return LOCAL_HOSTNAMES.has(new URL(serverUrl).hostname)
  } catch {
    return false
  }
}

const quickLoginUrl = (serverUrl: string): string =>
  `${serverUrl.trim().replace(/\/+$/, '')}${AUTH_BASE_PATH}/dev/quick-login`

/**
 * Probes the backend's dev quick-login endpoint. Returns the status when the
 * server runs with quick login enabled (local dev), null otherwise — including
 * for non-local servers, which are never probed.
 */
export const fetchDevQuickLoginStatus = async (
  serverUrl: string
): Promise<DevQuickLoginStatus | null> => {
  if (!isLocalServerUrl(serverUrl)) {
    return null
  }
  try {
    const response = await fetch(quickLoginUrl(serverUrl))
    if (!response.ok) {
      return null
    }
    const data = await response.json()
    if (!data || data.enabled !== true) {
      return null
    }
    return { enabled: true, email: String(data.email ?? '') }
  } catch {
    return null
  }
}

export const postDevQuickLogin = async (serverUrl: string): Promise<void> => {
  const response = await fetch(quickLoginUrl(serverUrl), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!response.ok) {
    throw new Error(`Quick login failed (${response.status})`)
  }
}
