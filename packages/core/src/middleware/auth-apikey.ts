import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from './middleware-factories.js'
/**
 * Reads an API key from the request and JWT-decodes it into a session. Leaves
 * an existing session alone, so it composes with other auth middleware.
 */
export const authAPIKey = pikkuMiddlewareFactory<{
  /** Where to look: the `x-api-key` header, the `apiKey` query param, or both. */
  source: 'header' | 'query' | 'all'
}>(({ source }) =>
  pikkuMiddleware(
    async ({ jwt: jwtService }, { http, setSession, session }, next) => {
      if (!http?.request || !setSession || session) {
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
