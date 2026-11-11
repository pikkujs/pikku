import { pikkuMiddleware } from '@pikku/core/middleware'
import type { CoreServices, CoreUserSession } from '@pikku/core/types'
import type {
  CorePikkuMiddleware,
  MiddlewarePriority,
} from '@pikku/core/middleware'
import { verifyJwsAccessToken } from 'better-auth/oauth2'
import { hasLiveSession, resolveAndSetSession } from './resolve-session.js'

/** The verified claims of an OAuth access token. */
export type OAuthAccessTokenPayload = Record<string, unknown> & {
  sub?: string
  scope?: string
}

/** Where a request's tokens are issued and verified. */
export type OAuthTokenIssuer = {
  /** The `iss` claim the token must carry. */
  issuer: string
  /** The `aud` claim the token must carry. Defaults to the request origin. */
  audience?: string | string[]
  /** The authorization server's JWKS. Defaults to `<issuer>/jwks`. */
  jwksUrl?: string
}

/** Options for {@link betterAuthOAuthAccessToken}. */
export type BetterAuthOAuthAccessTokenOptions = {
  /**
   * Issuer, audience and JWKS for a request. Pass a function when the origin is
   * only known per request (`http://127.0.0.1:4740` in dev, a host in production).
   */
  issuer: OAuthTokenIssuer | ((origin: string) => OAuthTokenIssuer)
  /** Scopes every token must carry. */
  requiredScopes?: readonly string[]
  /**
   * Map the verified claims to the app session. Receives the singleton services
   * so callers can enrich the session from their own data. Return
   * `null`/`undefined` to reject the caller.
   */
  mapToken?: (
    payload: OAuthAccessTokenPayload,
    services: CoreServices
  ) =>
    | CoreUserSession
    | null
    | undefined
    | Promise<CoreUserSession | null | undefined>
  /** Where this sits in the middleware order. */
  priority?: MiddlewarePriority
}

const bearerOf = (authorization: string | undefined | null) => {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')
  return match?.[1]
}

/**
 * A session middleware for callers that arrive with an OAuth access token,
 * such as an MCP client that signed in through the app's `oauthProvider`.
 *
 * Verifies the bearer locally against the authorization server's JWKS: no
 * database read and no `services.auth()`. It only acts on a JWT bearer, so a
 * session credential on `Authorization` (the `bearer()` plugin's signed
 * token) falls through to the cookie middlewares, and it stands down when an
 * earlier middleware already set a session.
 *
 * A bearer that is present but fails verification is "not authenticated",
 * never an error: the request continues anonymously and the route's own
 * auth gate answers 401, which is what makes an MCP client start sign-in.
 *
 * @example
 * betterAuthOAuthAccessToken({
 *   issuer: (origin) => ({ issuer: `${origin}/api/auth`, audience: origin }),
 * })
 */
export const betterAuthOAuthAccessToken = (
  options: BetterAuthOAuthAccessTokenOptions
): CorePikkuMiddleware => {
  const { issuer, requiredScopes, mapToken, priority } = options

  return pikkuMiddleware({
    priority,
    func: async (services, wire, next) => {
      const { http, setInitialSession } = wire
      if (
        !http?.request ||
        !setInitialSession ||
        (await hasLiveSession(wire))
      ) {
        return next()
      }
      const request = http.request
      const token = bearerOf(request.header('authorization'))
      if (!token || token.split('.').length !== 3) {
        return next()
      }

      const proto =
        request.header('x-forwarded-proto')?.split(',')[0]?.trim() || 'http'
      const host =
        request.header('x-forwarded-host')?.split(',')[0]?.trim() ||
        request.header('host')
      if (!host) {
        return next()
      }
      const origin = `${proto}://${host}`
      const resolved = typeof issuer === 'function' ? issuer(origin) : issuer
      const audience = resolved.audience ?? origin

      let payload: OAuthAccessTokenPayload | undefined
      try {
        payload = (await verifyJwsAccessToken(token, {
          verifyOptions: { issuer: resolved.issuer, audience },
          jwksFetch: resolved.jwksUrl ?? `${resolved.issuer}/jwks`,
        })) as OAuthAccessTokenPayload
      } catch (e: any) {
        services.logger?.warn(
          `better-auth oauth access token rejected: ${e?.message ?? e}`
        )
        return next()
      }

      const granted = new Set((payload?.scope ?? '').split(' '))
      if (
        !payload?.sub ||
        !(requiredScopes ?? []).every((scope) => granted.has(scope))
      ) {
        return next()
      }

      if (mapToken) {
        const mapped = await mapToken(payload, services)
        if (mapped) {
          await setInitialSession(mapped)
        }
        return next()
      }

      await resolveAndSetSession({
        result: {
          user: {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
          },
          session: null,
        },
        services,
        getHeader: (name) => request.header(name),
        setInitialSession,
      })
      return next()
    },
  })
}
