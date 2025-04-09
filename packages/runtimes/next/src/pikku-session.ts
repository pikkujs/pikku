import {
  PikkuFetchHTTPRequest,
  PikkuUserSessionService,
  runMiddleware,
} from '@pikku/core'
import type {
  CoreSingletonServices,
  CoreUserSession,
  PikkuMiddleware,
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
  middleware: PikkuMiddleware[]
): Promise<UserSession | undefined> => {
  const request = new PikkuFetchHTTPRequest(nextRequest)
  const userSession = new PikkuUserSessionService<UserSession>()
  await runMiddleware(
    { ...singletonServices, userSession },
    {
      http: { request },
    },
    middleware as any
  )
  return userSession.get()
}
