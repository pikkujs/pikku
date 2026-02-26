import { pikkuMiddleware, pikkuMiddlewareFactory } from '../types/core.types.js'

/**
 * CORS middleware that handles cross-origin requests including OPTIONS preflight.
 *
 * Sets appropriate CORS headers on all responses and short-circuits OPTIONS
 * preflight requests with a 204 No Content response.
 *
 * @param options.origin - Allowed origin(s). Use `'*'` for any origin, a string for a single origin, or an array for multiple origins. Defaults to `'*'`.
 * @param options.methods - Allowed HTTP methods. Defaults to common methods.
 * @param options.headers - Allowed request headers. Defaults to common headers.
 * @param options.credentials - Whether to allow credentials. Defaults to `false`.
 * @param options.maxAge - Preflight cache duration in seconds. Defaults to `86400` (24 hours).
 *
 * @example
 * ```typescript
 * import { cors } from '@pikku/core/middleware'
 *
 * // Allow all origins
 * addHTTPMiddleware('*', [cors()])
 *
 * // Specific origin with credentials
 * addHTTPMiddleware('*', [
 *   cors({
 *     origin: 'https://app.example.com',
 *     credentials: true,
 *   })
 * ])
 *
 * // Multiple origins
 * addHTTPMiddleware('*', [
 *   cors({
 *     origin: ['https://app.example.com', 'https://admin.example.com'],
 *   })
 * ])
 * ```
 */
export const cors = pikkuMiddlewareFactory<{
  origin?: string | string[]
  methods?: string[]
  headers?: string[]
  credentials?: boolean
  maxAge?: number
}>(
  ({
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    headers = ['Content-Type', 'Authorization', 'x-api-key'],
    credentials = false,
    maxAge = 86400,
  } = {}) => {
    if (origin === '*' && credentials) {
      throw new Error('CORS misconfiguration: wildcard origin (*) cannot be used with credentials: true')
    }
    return pikkuMiddleware({
      name: 'CORS',
      description: 'Handles cross-origin requests including OPTIONS preflight',
      func: async (_services, wires, next) => {
        const request = wires.http?.request
        const response = wires.http?.response

        if (!request || !response) {
          return next()
        }

        const requestOrigin = request.header('origin')

        let allowedOrigin: string
        if (Array.isArray(origin)) {
          allowedOrigin =
            requestOrigin && origin.includes(requestOrigin)
              ? requestOrigin
              : origin[0]
        } else {
          allowedOrigin = origin
        }

        response.header('Access-Control-Allow-Origin', allowedOrigin)
        response.header('Access-Control-Allow-Methods', methods.join(', '))
        response.header('Access-Control-Allow-Headers', headers.join(', '))

        if (credentials) {
          response.header('Access-Control-Allow-Credentials', 'true')
        }

        if (Array.isArray(origin)) {
          response.header('Vary', 'Origin')
        }

        if (request.method() === 'options') {
          response.header('Access-Control-Max-Age', String(maxAge))
          response.status(204).json(undefined as any)
          return
        }

        return next()
      },
    })
  }
)
