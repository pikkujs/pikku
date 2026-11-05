import type { CoreSingletonServices } from '../types/core.types.js'
import { InvalidOriginError } from '../errors/errors.js'
import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from './middleware-factories.js'

/** Scheme + host + port, or null for anything unparseable including the literal `"null"` origin. */
export const toOrigin = (value: string | null | undefined): string | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol && url.host ? url.origin : null
  } catch {
    return null
  }
}

/** `localhost`, `127.0.0.1` or `[::1]`, with an optional port. Nothing else counts as loopback. */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

/**
 * The origin a request was addressed to, from its `Host` and `X-Forwarded-Proto`.
 *
 * With no proxy header the scheme is `http` only when the host is loopback, because a
 * local dev server speaks plain http and no proxy sits in front of it. Every other host
 * still defaults to `https`, so a missing header on a real host fails closed.
 */
export const hostOriginOf = (
  host: string | null | undefined,
  forwardedProto?: string | null
): string | null => {
  if (!host) return null
  const proto = forwardedProto || (LOOPBACK_HOST.test(host) ? 'http' : 'https')
  return toOrigin(`${proto}://${host}`)
}

/**
 * The browser origins an app allows, read from the `variables` service (never
 * `process.env`, which a Worker does not have): `CORS_ORIGINS` as a comma-separated
 * list, else `FRONTEND_URL`. Unset means no extra origins, so only the request's own
 * host is accepted.
 */
export const allowedOriginsFromVariables = async (services: {
  variables?: {
    get<T = string>(name: string): Promise<T | undefined> | T | undefined
  }
}): Promise<string[]> => {
  const variables = services.variables
  if (!variables) return []
  const configured = await variables.get<string>('CORS_ORIGINS')
  if (configured) {
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  }
  const frontendUrl = await variables.get<string>('FRONTEND_URL')
  return frontendUrl ? [frontendUrl] : []
}

/**
 * Whether a request origin may post to an origin-locked route.
 *
 * The comparison is exact on the parsed origin, never a suffix match:
 * `endsWith('myapp.com')` also accepts `https://evil-myapp.com`.
 */
export const isAllowedOrigin = (
  requestOrigin: string | null,
  hostOrigin: string | null,
  configuredOrigins: string[]
): boolean => {
  if (!requestOrigin) return false
  if (hostOrigin && requestOrigin === hostOrigin) return true
  return configuredOrigins.some(
    (allowed) => toOrigin(allowed) === requestOrigin
  )
}

/**
 * Rejects a request with a 403 unless its `Origin` is this app's own or explicitly allowed.
 *
 * This is not what `cors()` does. CORS sets response headers and is enforced by the
 * browser, so a non-browser client ignores them and the request still runs; this rejects
 * before the function body. It stops another site's page from posting to an unauthed
 * route — it is not flood control, because `Origin` is trusted from nobody but a browser.
 * A missing `Origin` is rejected too: a real browser sets one on a cross-origin-capable POST.
 *
 * @example snippet: requireOrigin
 */
export const requireOrigin = pikkuMiddlewareFactory<{
  /** Extra allowed origins beyond the request's own host, or a resolver for them. */
  origins?:
    | string[]
    | ((services: CoreSingletonServices) => string[] | Promise<string[]>)
}>(({ origins = [] } = {}) =>
  pikkuMiddleware({
    name: 'requireOrigin',
    description: 'Rejects requests that did not come from this app.',
    func: async (services, { http }, next) => {
      const request = http?.request
      if (!request) return next()

      const requestOrigin =
        toOrigin(request.header('origin')) ??
        toOrigin(request.header('referer'))

      const host = request.header('host')
      const hostOrigin = hostOriginOf(host, request.header('x-forwarded-proto'))

      const configured =
        typeof origins === 'function'
          ? await origins(services as CoreSingletonServices)
          : origins

      if (!isAllowedOrigin(requestOrigin, hostOrigin, configured)) {
        throw new InvalidOriginError(
          `Rejected origin ${requestOrigin ?? '(none)'}`
        )
      }

      return next()
    },
  })
)
