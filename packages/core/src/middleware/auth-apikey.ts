import {
  CoreConfig,
  CoreSingletonServices,
  CoreUserSession,
  CorePikkuMiddleware,
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
  const middleware: CorePikkuMiddleware = async (services, { http }, next) => {
    const { userSession: userSessionService, jwt: jwtService } = services as any
    if (!http?.request || userSessionService.get()) {
      return next()
    }

    let apiKey: string | null = null
    if (source === 'header' || source === 'all') {
      apiKey = http.request.header('x-api-key') as string | null
    }
    if (!apiKey && (source === 'query' || source === 'all')) {
      apiKey = http.request.query().apiKey as string | null
    }
    if (apiKey) {
      let userSession: UserSession | null = null
      if (jwt) {
        if (!jwtService) {
          throw new Error('JWT service is required for JWT decoding.')
        }
        userSession = await jwtService.decode(apiKey)
      } else {
        userSession = await getSessionForAPIKey!(services as any, apiKey)
      }
      if (userSession) {
        userSessionService.setInitial(userSession)
      }
    }
    return next()
  }

  return middleware
}
