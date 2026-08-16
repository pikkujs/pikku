import { pikkuMiddleware } from '@pikku/core/types'
import type {
  CorePikkuMiddleware,
  CoreServices,
  CoreUserSession,
} from '@pikku/core/types'
import { getSessionCookie } from 'better-auth/cookies'
import {
  resolveImpersonatedSession,
  type ImpersonationOptions,
} from './auth-session-impersonation.js'
import { stampActorFlag } from './stamp-actor-flag.js'
import { withResolvedScopes } from './auth-session-scopes.js'
import { verifySessionCredential } from './session-credential.js'
import type { SessionStore } from './session-store.js'

type StoredSession = { session: any; user: any }

export type SessionTransport = 'header' | 'cookie'

export type BetterAuthStoreSessionOptions = {
  store: (services: CoreServices) => SessionStore | Promise<SessionStore>
  transports?: readonly SessionTransport[]
  headerName?: string
  secretId?: string
  mapSession?: (
    result: StoredSession,
    services: CoreServices
  ) => CoreUserSession | Promise<CoreUserSession>
  impersonation?: ImpersonationOptions
}

const bearerCredential = (raw: string | undefined | null): string | null => {
  if (!raw) {
    return null
  }
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return match?.[1]?.trim() || null
}

const notExpired = (stored: StoredSession, now: number): boolean => {
  const expiresAt = stored.session?.expiresAt
  if (expiresAt === undefined || expiresAt === null) {
    return true
  }
  const at = new Date(expiresAt).getTime()
  return Number.isNaN(at) || at > now
}

/**
 * Store-backed better-auth session middleware: resolves a session through
 * better-auth's `secondaryStorage` rather than the database or a signed cookie
 * blob. Under `secondaryStorage` the session token IS the store key, so one
 * `get` yields `{ session, user }` — no database read, and no better-auth
 * server in the bundle.
 *
 * That is what retires the objection in `cross-site-cookies.ts` to better-auth's
 * `bearer()` plugin: the opaque `session_token` needed a database lookup only
 * while the session lived in the database.
 *
 * So the credential here is better-auth's own signed session token, arriving on
 * `Authorization: Bearer …` or on its session cookie, selectable per app via
 * `transports`. A browser cannot set a header on a top-level navigation, so a
 * server-rendered app has only the cookie; a single-page app fetches everything
 * from JavaScript and needs no cookie at all. Both transports carry the same
 * value, verified the same way and resolved through the same store read, so an
 * app carries one path and never two.
 *
 * Enable better-auth's `bearer()` plugin to obtain the header form: it echoes
 * the token on `set-auth-token`, which the better-auth clients already read.
 * Because a header-carried credential is not tied to an origin, it also serves
 * clients a cookie cannot reach — a third-party preview iframe under WebKit, or
 * a native client whose webview origin is a custom scheme.
 *
 * Revocation is immediate on both transports: signing out deletes the store
 * entry and the next request finds nothing to resolve. That is the difference
 * from {@link betterAuthStatelessSession}, which cannot see a revocation until
 * its cookie cache ages out.
 */
export const betterAuthStoreSession = (
  options: BetterAuthStoreSessionOptions
): CorePikkuMiddleware => {
  const {
    store,
    mapSession,
    impersonation,
    transports = ['header', 'cookie'] as const,
    headerName = 'authorization',
    secretId = 'BETTER_AUTH_SECRET',
  } = options

  const headerEnabled = transports.includes('header')
  const cookieEnabled = transports.includes('cookie')

  return pikkuMiddleware(
    async (services, { http, setSession, session }, next) => {
      if (!http?.request || !setSession || session) {
        return next()
      }
      const request = http.request

      const credential =
        (headerEnabled ? bearerCredential(request.header(headerName)) : null) ??
        (cookieEnabled
          ? getSessionCookie(new Headers(request.headers()))
          : null)

      if (!credential) {
        return next()
      }

      let secret: string | undefined
      try {
        secret = (
          await (services as any).secrets?.getSecret(secretId)
        )?.reveal()
      } catch (e: any) {
        if (e?.message !== 'Requested secret not found') {
          throw e
        }
        services.logger?.error(
          `betterAuthStoreSession: secret '${secretId}' not found — session middleware skipped. Ensure ${secretId} is configured.`
        )
        return next()
      }
      if (!secret) {
        return next()
      }

      const token = await verifySessionCredential(credential, secret)
      if (!token) {
        return next()
      }

      let stored: StoredSession | null
      try {
        const raw = await (await store(services as CoreServices)).get(token)
        stored = raw ? (JSON.parse(raw) as StoredSession) : null
      } catch (e: any) {
        services.logger?.error(
          `better-auth store session read failed: ${e?.message ?? e}`
        )
        throw e
      }

      if (!stored?.user || !notExpired(stored, Date.now())) {
        return next()
      }

      if (impersonation) {
        const impersonated = await resolveImpersonatedSession(
          stored,
          impersonation,
          services as CoreServices,
          (name) => request.header(name),
          mapSession
        )
        if (impersonated) {
          setSession(
            await withResolvedScopes(impersonated, services as CoreServices)
          )
          return next()
        }
      }

      const mapped = mapSession
        ? await mapSession(stored, services as CoreServices)
        : ({ userId: stored.user.id } as CoreUserSession)

      setSession(
        await withResolvedScopes(
          stampActorFlag(mapped, stored.user),
          services as CoreServices
        )
      )

      return next()
    }
  )
}
