import { pikkuMiddleware, pikkuMiddlewareFactory } from '../types/core.types.js'

/**
 * API key middleware that retrieves a session from the 'x-api-key' header using JWT decoding.
 *
 * Extracts API key from either the 'x-api-key' header or 'apiKey' query parameter
 * and decodes it using the JWT service.
 *
 * @param options.source - Where to look for the API key: 'header', 'query', or 'all'
 *
 * @example
 * ```typescript
 * import { authAPIKey } from '@pikku/core/middleware'
 *
 * addHTTPMiddleware([
 *   authAPIKey({ source: 'header' })
 * ])
 * ```
 */
export const authAPIKey = pikkuMiddlewareFactory<{
  source: 'header' | 'query' | 'all'
}>(({ source }) =>
  pikkuMiddleware(
    async ({ jwt: jwtService }, { http, setSession, getSession }, next) => {
      if (!http?.request || !setSession || getSession?.()) {
        return next()
      }

      let apiKey: string | null = null
      if (source === 'header' || source === 'all') {
        apiKey = http.request.header('x-api-key') as string | null
      }
      if (!apiKey && (source === 'query' || source === 'all')) {
        apiKey = http.request.query().apiKey as string | null
      }

      if (apiKey && jwtService) {
        const userSession = await jwtService.decode(apiKey)
        if (userSession) {
          setSession?.(userSession)
        }
      }

      return next()
    }
  )
)
