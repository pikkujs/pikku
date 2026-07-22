import type { PikkuCliSession } from './cli-session.js'
import { normalizeBaseURL } from './cli-session.js'

/** RFC 8628 device-authorization grant type. */
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval: number
}

interface DeviceTokenSuccess {
  access_token: string
  token_type?: string
  expires_in?: number
}

interface DeviceTokenPending {
  error:
    | 'authorization_pending'
    | 'slow_down'
    | 'access_denied'
    | 'expired_token'
  error_description?: string
}

export interface DevicePrompt {
  /** Where the user approves the request. */
  verificationUri: string
  /** Same as above with the code pre-filled (open this if present). */
  verificationUriComplete?: string
  userCode: string
  /** Absolute ms timestamp when the code expires. */
  expiresAtMs: number
}

export interface DeviceLoginOptions {
  /** Server origin, e.g. `https://app.example.com`. */
  baseURL: string
  /** better-auth basePath. Defaults to `/auth`. */
  authBasePath?: string
  /** Logical client identifier (no OIDC registration required). */
  clientId?: string
  /** Optional space-separated scopes to request. */
  scope?: string
  /** Called once the device code is issued, so the caller can prompt the user. */
  onPrompt: (prompt: DevicePrompt) => void | Promise<void>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const joinUrl = (base: string, path: string) =>
  `${base}${path.startsWith('/') ? '' : '/'}${path}`

/**
 * Run the better-auth device-authorization flow against `baseURL` and return a
 * persisted-shaped session (token + best-effort expiry/user). The human
 * approves in the browser; this only requests a code and polls for the token.
 */
export const deviceLogin = async (
  opts: DeviceLoginOptions
): Promise<PikkuCliSession> => {
  const baseURL = normalizeBaseURL(opts.baseURL)
  const authBase = `${baseURL}${opts.authBasePath ?? '/auth'}`
  const clientId = opts.clientId ?? 'pikku-cli'

  // 1. Request a device + user code.
  const codeRes = await fetch(joinUrl(authBase, '/device/code'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: opts.scope }),
  })
  if (!codeRes.ok) {
    throw new Error(
      `device/code failed (${codeRes.status}): ${await codeRes.text()}`
    )
  }
  const code = (await codeRes.json()) as DeviceCodeResponse
  const expiresAtMs = Date.now() + code.expires_in * 1000

  await opts.onPrompt({
    verificationUri: code.verification_uri,
    verificationUriComplete: code.verification_uri_complete,
    userCode: code.user_code,
    expiresAtMs,
  })

  // 2. Poll the token endpoint until approved, denied, or expired.
  let intervalMs = Math.max(1, code.interval) * 1000
  while (Date.now() < expiresAtMs) {
    await sleep(intervalMs)
    const tokenRes = await fetch(joinUrl(authBase, '/device/token'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: DEVICE_GRANT_TYPE,
        device_code: code.device_code,
        client_id: clientId,
      }),
    })
    const body = (await tokenRes.json().catch(() => ({}))) as
      | DeviceTokenSuccess
      | DeviceTokenPending

    if (tokenRes.ok && 'access_token' in body && body.access_token) {
      return finalizeSession(baseURL, authBase, body)
    }

    const error = (body as DeviceTokenPending).error
    if (error === 'authorization_pending') {
      continue
    }
    if (error === 'slow_down') {
      // Back off as the spec requires.
      intervalMs += 5000
      continue
    }
    if (error === 'access_denied') {
      throw new Error('Login was denied in the browser.')
    }
    if (error === 'expired_token') {
      break
    }
    // Unknown non-pending error — surface it rather than spinning.
    throw new Error(
      `device/token failed (${tokenRes.status}): ${JSON.stringify(body)}`
    )
  }
  throw new Error('Login timed out before it was approved.')
}

/**
 * Turn a token response into a stored session. Best-effort enriches it with the
 * server-reported expiry + user by calling `/auth/get-session` with the bearer
 * token (works when the `bearer` plugin is enabled); falls back to the token's
 * own `expires_in` if that call is unavailable.
 */
const finalizeSession = async (
  baseURL: string,
  authBase: string,
  token: DeviceTokenSuccess
): Promise<PikkuCliSession> => {
  const obtainedAt = new Date().toISOString()
  let expiresAt: string | undefined
  let user: PikkuCliSession['user']

  if (typeof token.expires_in === 'number') {
    expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString()
  }

  try {
    const res = await fetch(joinUrl(authBase, '/get-session'), {
      headers: { authorization: `Bearer ${token.access_token}` },
    })
    if (res.ok) {
      const data = (await res.json()) as {
        session?: { expiresAt?: string }
        user?: { id: string; email?: string; name?: string }
      } | null
      if (data?.session?.expiresAt) {
        expiresAt = new Date(data.session.expiresAt).toISOString()
      }
      if (data?.user) {
        user = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
        }
      }
    }
  } catch {
    // get-session not reachable — keep whatever expiry we already have.
  }

  return {
    baseURL,
    accessToken: token.access_token,
    tokenType: token.token_type ?? 'Bearer',
    expiresAt,
    user,
    obtainedAt,
  }
}
