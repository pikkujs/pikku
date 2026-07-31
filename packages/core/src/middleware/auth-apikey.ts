import { pikkuMiddleware, pikkuMiddlewareFactory } from '../types/core.types.js'

export const authAPIKey = pikkuMiddlewareFactory<{
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
