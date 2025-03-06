import { PikkuQuery } from '../http/http-routes.types.js'
import { PikkuMiddleware } from '../types/core.types.js'

/**
 * Query middleware that retrieves a session using query parameters.
 *
 * @param options.getSessionForQueryValue - A function that returns a session based on query parameters.
 */
export const queryMiddleware = (
  options: {
    getSessionForQueryValue?: (query: PikkuQuery) => Promise<any>
  } = {}
): PikkuMiddleware => {
  const middleware: PikkuMiddleware = async (
    { userSessionService },
    { http },
    next
  ) => {
    if (!http?.request || userSessionService.get()) {
      return next()
    }

    if (options.getSessionForQueryValue) {
      const query = http.request.getQuery()
      const userSession = await options.getSessionForQueryValue(query)
      if (userSession) {
        await userSessionService.set(userSession)
      }
    }
    return next()
  }
  return middleware
}
