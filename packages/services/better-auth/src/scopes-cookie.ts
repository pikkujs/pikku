import { parseCookies } from 'better-auth/cookies'
import { crossSiteCookies } from './cross-site-cookies.js'

/** Name of the signed cookie carrying a resolved scope snapshot. */
export const SCOPES_COOKIE = 'pikku_scopes'

/** The scopes resolved for `userId` at `at` (epoch ms). */
export type ScopeSnapshot = { userId: string; scopes: string[]; at: number }

const encoder = new TextEncoder()

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> | null => {
  const standard = value.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return Uint8Array.from(
      atob(standard.padEnd(Math.ceil(standard.length / 4) * 4, '=')),
      (c) => c.charCodeAt(0)
    )
  } catch {
    return null
  }
}

const hmacKey = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  )

/** `payload.signature`, both base64url; the payload is the JSON snapshot. */
export const signScopeSnapshot = async (
  snapshot: ScopeSnapshot,
  secret: string
): Promise<string> => {
  const payload = toBase64Url(encoder.encode(JSON.stringify(snapshot)))
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret, 'sign'),
    encoder.encode(payload)
  )
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`
}

/** The snapshot a cookie value carries, or `null` for anything forged, malformed or unsigned. */
export const verifyScopeSnapshot = async (
  value: string | null | undefined,
  secret: string
): Promise<ScopeSnapshot | null> => {
  const [payload, signature, ...rest] = (value ?? '').split('.')
  if (!payload || !signature || rest.length > 0) {
    return null
  }
  const signatureBytes = fromBase64Url(signature)
  if (
    !signatureBytes ||
    !(await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret, 'verify'),
      signatureBytes,
      encoder.encode(payload)
    ))
  ) {
    return null
  }
  try {
    const bytes = fromBase64Url(payload)
    const parsed = JSON.parse(new TextDecoder().decode(bytes!))
    return typeof parsed?.userId === 'string' &&
      typeof parsed.at === 'number' &&
      Array.isArray(parsed.scopes) &&
      parsed.scopes.every((s: unknown) => typeof s === 'string')
      ? (parsed as ScopeSnapshot)
      : null
  } catch {
    return null
  }
}

/** Where a resolved scope snapshot is kept between requests. */
export type ScopesCache = {
  /** How long a snapshot is trusted, in seconds. Zero never trusts one. */
  ttlSeconds: number
  read: () => Promise<ScopeSnapshot | null>
  write: (snapshot: ScopeSnapshot) => Promise<void>
}

type CookieWriter = {
  cookie: (
    name: string,
    value: string | null,
    options: Record<string, unknown>
  ) => unknown
}

/**
 * The signed-cookie {@link ScopesCache}. Absent when the TTL is zero, there is
 * no response to write to, or there is no secret to sign with: the caller then
 * reads on every request, as it always did.
 */
export const scopesCookieCache = ({
  ttlSeconds,
  secret,
  cookieHeader,
  response,
}: {
  ttlSeconds: number
  secret: string | undefined
  cookieHeader: string | null | undefined
  response: CookieWriter | undefined
}): ScopesCache | undefined => {
  if (!(ttlSeconds > 0) || !secret || !response) {
    return undefined
  }
  const crossSite = crossSiteCookies()
  const insecureAllowed =
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
  return {
    ttlSeconds,
    read: () =>
      verifyScopeSnapshot(
        parseCookies(cookieHeader ?? '').get(SCOPES_COOKIE),
        secret
      ),
    write: async (snapshot) => {
      response.cookie(
        SCOPES_COOKIE,
        await signScopeSnapshot(snapshot, secret),
        {
          httpOnly: true,
          path: '/',
          maxAge: ttlSeconds,
          ...(crossSite
            ? { sameSite: 'none', secure: true, partitioned: true }
            : { sameSite: 'lax', secure: !insecureAllowed }),
        }
      )
    },
  }
}
