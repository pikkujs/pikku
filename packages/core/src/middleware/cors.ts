import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from './middleware-factories.js'
/**
 * Sets CORS headers on every response and short-circuits OPTIONS preflight
 * with a 204. `origin: true` reflects the request origin; an array reflects a
 * matching origin and otherwise sends no `Access-Control-Allow-Origin` at all,
 * so the browser reports "origin not allowed" rather than an origin mismatch
 * against whichever entry happened to be first.
 *
 * @example snippet: corsMiddleware
 */
export const cors = pikkuMiddlewareFactory<{
  /** Which origins may call. Defaults to `*`, which the browser rejects alongside `credentials: true` — name the origins instead. */
  origin?: string | string[] | true
  /** Methods a cross-origin caller may use. Defaults to the common six; a method missing here fails preflight rather than the request. */
  methods?: string[]
  /** Request headers a caller may send. Defaults to content-type, authorization and x-api-key. */
  headers?: string[]
  /** Response headers the browser will let the caller's JavaScript read. Everything else is hidden from it even on a 200. */
  exposeHeaders?: string[]
  /** Whether cookies and auth headers ride along. Requires a named origin, never `*`. */
  credentials?: boolean
  /** Seconds the browser may cache this preflight. Defaults to a day. */
  maxAge?: number
}>(
  ({
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    headers = ['Content-Type', 'Authorization', 'x-api-key'],
    exposeHeaders = [],
    credentials = false,
    maxAge = 86400,
  } = {}) => {
    if (origin === '*' && credentials) {
      throw new Error(
        'CORS misconfiguration: wildcard origin (*) cannot be used with credentials: true'
      )
    }
    return pikkuMiddleware({
      name: 'CORS',
      description: 'Handles cross-origin requests including OPTIONS preflight',
      func: async (services, wires, next) => {
        const request = wires.http?.request
        const response = wires.http?.response

        if (!request || !response) {
          return next()
        }

        const requestOrigin = request.header('origin')

        let allowedOrigin: string | undefined
        if (origin === true) {
          allowedOrigin = requestOrigin || '*'
        } else if (Array.isArray(origin)) {
          allowedOrigin =
            requestOrigin && origin.includes(requestOrigin)
              ? requestOrigin
              : undefined
          if (requestOrigin && !allowedOrigin) {
            services.logger.debug(
              `CORS: origin '${requestOrigin}' is not in the allowed list, omitting Access-Control-Allow-Origin`
            )
          }
        } else {
          allowedOrigin = origin
        }

        if (allowedOrigin) {
          response.header('Access-Control-Allow-Origin', allowedOrigin)
        }
        response.header('Access-Control-Allow-Methods', methods.join(', '))
        response.header('Access-Control-Allow-Headers', headers.join(', '))

        if (exposeHeaders.length > 0) {
          response.header(
            'Access-Control-Expose-Headers',
            exposeHeaders.join(', ')
          )
        }

        if (credentials && allowedOrigin) {
          response.header('Access-Control-Allow-Credentials', 'true')
        }

        if (origin === true || Array.isArray(origin)) {
          response.header('Vary', 'Origin')
        }

        if (request.method() === 'options') {
          response.header('Access-Control-Max-Age', String(maxAge))
          // 204 carries no body, and `json` has no no-content overload.
          response.status(204).json(undefined as never)
          return
        }

        return next()
      },
    })
  }
)
