import {
  PikkuHTTPRequest,
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
  const request = new PikkuHTTPRequest(nextRequest)
  const userSessionService = new PikkuUserSessionService<UserSession>()
  await runMiddleware(
    { ...singletonServices, userSessionService },
    {
      http: { request },
    },
    middleware as any
  )
  return userSessionService.get()
}
