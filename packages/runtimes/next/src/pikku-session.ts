import { PikkuSessionService, runMiddleware } from '@pikku/core'
import { PikkuFetchHTTPRequest } from '@pikku/core/http'
import type {
  CoreSingletonServices,
  CoreUserSession,
  CorePikkuMiddleware,
} from '@pikku/core'

/**
 * Retrieves the user session from the request via the middleware provided.
 * @param request - NextRequest from next/server (accepts any version)
 * @param singletonServices
 * @param middleware
 * @returns
 */
export const getSession = async <UserSession extends CoreUserSession>(
  nextRequest: Request,
  singletonServices: CoreSingletonServices,
  middleware: CorePikkuMiddleware[]
): Promise<UserSession | undefined> => {
  const request = new PikkuFetchHTTPRequest(nextRequest)
  const userSession = new PikkuSessionService<UserSession>()
  await runMiddleware(
    singletonServices,
    {
      http: { request },
      session: userSession,
    },
    middleware as any
  )
  return userSession.get()
}
