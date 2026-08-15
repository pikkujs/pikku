import { runMiddleware } from '@pikku/core/ecosystem/middleware'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '@pikku/core/ecosystem/services'
import { PikkuFetchHTTPRequest } from '@pikku/core/ecosystem/http'
import type {
  CoreSingletonServices,
  CoreUserSession,
  CorePikkuMiddleware,
} from '@pikku/core/ecosystem/types'
import type { PikkuWire } from '@pikku/core/ecosystem/types'

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
  middleware: CorePikkuMiddleware<CoreSingletonServices, UserSession>[]
): Promise<UserSession | undefined> => {
  const request = new PikkuFetchHTTPRequest(nextRequest)
  const userSession = new PikkuSessionService<CoreUserSession>(
    singletonServices.sessionStore as any
  )
  await runMiddleware(
    singletonServices,
    {
      http: { request },
      ...createMiddlewareSessionWireProps(userSession),
    } as unknown as PikkuWire,
    middleware as any
  )
  return userSession.get() as UserSession | undefined
}
