import { pikkuMiddleware, pikkuMiddlewareFactory } from '../types/core.types.js'

/**
 * Sets CORS headers on every response and short-circuits OPTIONS preflight
 * with a 204. `origin: true` reflects the request origin; an array reflects a
 * matching origin and otherwise falls back to its first entry.
 */
export const cors = pikkuMiddlewareFactory<{
  origin?: string | string[] | true
  methods?: string[]
  headers?: string[]
  exposeHeaders?: string[]
  credentials?: boolean
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
      func: async (_services, wires, next) => {
        const request = wires.http?.request
        const response = wires.http?.response

        if (!request || !response) {
          return next()
        }

        const requestOrigin = request.header('origin')

        let allowedOrigin: string
        if (origin === true) {
          allowedOrigin = requestOrigin || '*'
        } else if (Array.isArray(origin)) {
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

        if (exposeHeaders.length > 0) {
          response.header(
            'Access-Control-Expose-Headers',
            exposeHeaders.join(', ')
          )
        }

        if (credentials) {
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
