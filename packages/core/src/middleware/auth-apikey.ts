import {
  CoreConfig,
  CoreSingletonServices,
  CoreUserSession,
  PikkuMiddleware,
} from '../types/core.types.js'

/**
 * API key middleware that retrieves a session from the 'x-api-key' header using a provided callback.
 *
 * @param options.getSessionForAPIKey - A function that returns a session when provided an API key.
 */
export const authAPIKey = <
  SingletonServices extends CoreSingletonServices<CoreConfig>,
  UserSession extends CoreUserSession,
>({
  source,
  getSessionForAPIKey,
  jwt,
}: {
  source: 'header' | 'query' | 'all'
} & (
  | {
      getSessionForAPIKey?: undefined
      jwt?: true
    }
  | {
      getSessionForAPIKey: (
        services: SingletonServices,
        apiKey: string
      ) => Promise<any>
      jwt?: false
    }
)) => {
  const middleware: PikkuMiddleware = async (services, { http }, next) => {
    if (!http?.request || services.userSession.get()) {
      return next()
    }

    let apiKey: string | null = null
    if (source === 'header' || source === 'all') {
      apiKey = http.request.getHeader('x-api-key') as string | null
    }
    if (!apiKey && (source === 'query' || source === 'all')) {
      apiKey = http.request.getQuery().apiKey as string | null
    }
    if (apiKey) {
      let userSession: UserSession | null = null
      if (jwt) {
        if (!services.jwt) {
          throw new Error('JWT service is required for JWT decoding.')
        }
        userSession = await services.jwt.decode(apiKey)
      } else {
        userSession = await getSessionForAPIKey!(services as any, apiKey)
      }
      if (userSession) {
        await services.userSession.set(userSession)
      }
    }
    return next()
  }

  return middleware
}
