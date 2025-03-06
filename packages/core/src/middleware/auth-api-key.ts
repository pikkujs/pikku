import { PikkuMiddleware } from '../types/core.types.js'

/**
 * API key middleware that retrieves a session from the 'x-api-key' header using a provided callback.
 *
 * @param options.getSessionForAPIKey - A function that returns a session when provided an API key.
 */
export const apiKeyMiddleware = (
  options: { getSessionForAPIKey?: (apiKey: string) => Promise<any> } = {}
) => {
  const middleware: PikkuMiddleware = async (
    { userSessionService },
    { http },
    next
  ) => {
    if (!http?.request || userSessionService.get()) {
      return next()
    }

    if (options.getSessionForAPIKey) {
      const apiKey = http.request.getHeader('x-api-key')
      if (apiKey) {
        const userSession = await options.getSessionForAPIKey(apiKey)
        if (userSession) {
          await userSessionService.set(userSession)
        }
      }
    }
    return next()
  }
  return middleware
}
