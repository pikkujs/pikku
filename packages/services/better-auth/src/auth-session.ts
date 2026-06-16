import type { CoreUserSession, CorePikkuMiddleware } from '@pikku/core'
import { pikkuMiddleware } from '@pikku/core'
import type { BetterAuthInstance } from './define-auth.js'

type BetterAuthSessionResult = { user: any; session: any }

type BetterAuthSessionOptions = {
  mapSession?: (result: BetterAuthSessionResult) => CoreUserSession
}

export const betterAuthSession = (
  options: BetterAuthSessionOptions = {}
): CorePikkuMiddleware => {
  const { mapSession } = options
  return pikkuMiddleware(async (services, { http, setSession, session }, next) => {
    if (!http?.request || !setSession || session) {
      return next()
    }

    try {
      const auth = (await (services as any).auth()) as BetterAuthInstance
      // getSession only needs the request headers — build them directly instead
      // of going through toWebRequest(), which (for a POST) would otherwise read
      // the single-use request body just to discard it, starving the route
      // handler that actually needs it.
      const result = (await auth.api.getSession({
        headers: new Headers(http.request.headers()),
      })) as BetterAuthSessionResult | null

      if (result?.user) {
        setSession(
          mapSession
            ? mapSession(result)
            : ({ userId: result.user.id } as CoreUserSession)
        )
      }
    } catch (e: any) {
      services.logger?.warn(`better-auth session read failed: ${e?.message}`)
    }

    return next()
  })
}
