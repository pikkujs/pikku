import { PikkuUserSessionService, runMiddleware } from '@pikku/core'
import type {
  CoreSingletonServices,
  CoreUserSession,
  PikkuMiddleware,
} from '@pikku/core'
import { NextRequest } from 'next/server.js'
import { PikkuNextRequest } from './pikku-next-request.js'

/**
 * Retrieves the user session from the request via the middleware provided.
 * @param request
 * @param singletonServices
 * @param middleware
 * @returns
 */
export const getSession = async <UserSession extends CoreUserSession>(
  request: NextRequest,
  singletonServices: CoreSingletonServices,
  middleware: PikkuMiddleware[]
): Promise<UserSession | undefined> => {
  const userSessionService = new PikkuUserSessionService<UserSession>()
  await runMiddleware(
    { ...singletonServices, userSessionService },
    {
      http: { request: new PikkuNextRequest(request) },
    },
    middleware as any
  )
  return userSessionService.get()
}
