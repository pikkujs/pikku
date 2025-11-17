import { PikkuUserInteractionService, runMiddleware } from '@pikku/core'
import { PikkuFetchHTTPRequest } from '@pikku/core/http'
import type {
  CoreSingletonServices,
  CoreUserSession,
  CorePikkuMiddleware,
} from '@pikku/core'
import { NextRequest } from 'next/server.js'

/**
 * Retrieves the user session from the request via the middleware provided.
 * @param request
 * @param singletonServices
 * @param middleware
 * @returns
 */
export const getSession = async <UserSession extends CoreUserSession>(
  nextRequest: NextRequest,
  singletonServices: CoreSingletonServices,
  middleware: CorePikkuMiddleware[]
): Promise<UserSession | undefined> => {
  const request = new PikkuFetchHTTPRequest(nextRequest)
  const userSession = new PikkuUserInteractionService<UserSession>()
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
