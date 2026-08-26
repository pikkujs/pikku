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
  return configuredOrigins.some((allowed) => toOrigin(allowed) === requestOrigin)
}

/**
 * Rejects a request with a 403 unless its `Origin` is this app's own or explicitly allowed.
 *
 * This is not what `cors()` does. CORS sets response headers and is enforced by the
 * browser, so a non-browser client ignores them and the request still runs; this rejects
 * before the function body. It stops another site's page from posting to an unauthed
 * route — it is not flood control, because `Origin` is trusted from nobody but a browser.
 * A missing `Origin` is rejected too: a real browser sets one on a cross-origin-capable POST.
 */
export const analyticsOrigin = pikkuMiddlewareFactory<{
  /** Extra allowed origins beyond the request's own host, or a resolver for them. */
  origins?:
    | string[]
    | ((services: CoreSingletonServices) => string[] | Promise<string[]>)
}>(({ origins = [] } = {}) =>
  pikkuMiddleware({
    name: 'analyticsOrigin',
    description: 'Rejects requests that did not come from this app.',
    func: async (services, { http }, next) => {
      const request = http?.request
      if (!request) return next()

      const requestOrigin =
        toOrigin(request.header('origin')) ??
        toOrigin(request.header('referer'))

      const host = request.header('host')
      const proto = request.header('x-forwarded-proto') ?? 'https'
      const hostOrigin = host ? toOrigin(`${proto}://${host}`) : null

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
