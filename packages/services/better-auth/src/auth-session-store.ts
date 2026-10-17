import { pikkuMiddleware } from '@pikku/core/middleware'
import type { CoreServices, CoreUserSession } from '@pikku/core/types'
import type {
  CorePikkuMiddleware,
  MiddlewarePriority,
} from '@pikku/core/middleware'
import { getSessionCookie } from 'better-auth/cookies'
import type { ImpersonationOptions } from './auth-session-impersonation.js'
import { mergeRelayedCookies } from './cross-site-cookies.js'
import { verifySessionCredential } from './session-credential.js'
import type { AuthSessionStorage } from './session-store.js'
import {
  hasLiveSession,
  readSessionSecret,
  resolveAndSetSession,
} from './resolve-session.js'

/** The `{ session, user }` better-auth writes under a session token. */
export type StoredSession = { session: any; user: any }

/** Where `betterAuthStoreSession` looks for the signed session token. */
export type SessionTransport = 'header' | 'cookie'

/** Options for {@link betterAuthStoreSession}. */
export type BetterAuthStoreSessionOptions = {
  /**
   * The same storage the app passes better-auth as `secondaryStorage`. Only
   * `get` is called here.
   */
  store: (
    services: CoreServices
  ) =>
    Pick<AuthSessionStorage, 'get'> | Promise<Pick<AuthSessionStorage, 'get'>>
  /** Which transports may carry the token. Defaults to both. */
  transports?: readonly SessionTransport[]
  /** Header carrying `Bearer <token>`. Defaults to `authorization`. */
  headerName?: string
  /** Secret the token is signed with. Defaults to `BETTER_AUTH_SECRET`. */
  secretId?: string
  /** The app's `advanced.cookiePrefix`. Defaults to better-auth's own `better-auth`. */
  cookiePrefix?: string
  /** Map the stored `{ user, session }` to the app session. */
  mapSession?: (
    result: StoredSession,
    services: CoreServices
  ) => CoreUserSession | Promise<CoreUserSession>
  /** Honour the impersonation header for callers allowed to; off when omitted. */
  impersonation?: ImpersonationOptions
  /**
   * Where this sits in the middleware order. The CLI generates its default-map
   * registration at `lowest` so an app's own registration (default `medium`)
   * resolves the session first and this one short-circuits.
   */
  priority?: MiddlewarePriority
}

const bearerCredential = (raw: string | undefined | null): string | null => {
  if (!raw) {
    return null
  }
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return match?.[1]?.trim() || null
}

/** A malformed expiry fails closed: it reads as already expired. */
const notExpired = (stored: StoredSession, now: number): boolean => {
  const expiresAt = stored.session?.expiresAt
  if (expiresAt === undefined || expiresAt === null) {
    return true
  }
  const at = new Date(expiresAt).getTime()
  return !Number.isNaN(at) && at > now
}

/**
 * better-auth writes a JSON string, but a storage that serialises for itself
 * (an object store, a Redis client with JSON mode) hands the object back.
 */
const parseStored = (raw: unknown): StoredSession | null => {
  if (raw === null || raw === undefined || raw === '') {
    return null
  }
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  return typeof value === 'object' && value !== null
    ? (value as StoredSession)
    : null
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
 *
 * @example snippet: betterAuthStoreSession
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
    cookiePrefix,
    priority,
  } = options

  const headerEnabled = transports.includes('header')
  const cookieEnabled = transports.includes('cookie')

  return pikkuMiddleware({
    priority,
    func: async (services, wire, next) => {
      const { http, setInitialSession } = wire
      if (!http?.request || !setInitialSession || (await hasLiveSession(wire))) {
        return next()
      }
      const request = http.request
      const headers = mergeRelayedCookies(new Headers(request.headers()))

      const credential =
        (headerEnabled ? bearerCredential(headers.get(headerName)) : null) ??
        (cookieEnabled ? getSessionCookie(headers, { cookiePrefix }) : null)

      if (!credential) {
        return next()
      }

      const secret = await readSessionSecret(
        services,
        secretId,
        'betterAuthStoreSession'
      )
      if (!secret) {
        return next()
      }

      const token = await verifySessionCredential(credential, secret)
      if (!token) {
        return next()
      }

      let stored: StoredSession | null
      try {
        stored = parseStored(await (await store(services)).get(token))
      } catch (e: any) {
        services.logger?.error(
          `better-auth store session read failed: ${e?.message ?? e}`
        )
        throw e
      }

      if (!stored?.user || !notExpired(stored, Date.now())) {
        return next()
      }

      await resolveAndSetSession({
        result: stored,
        services,
        getHeader: (name) => headers.get(name),
        setInitialSession,
        mapSession,
        impersonation,
      })

      return next()
    },
  })
}
