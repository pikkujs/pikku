import type { CoreUserSession, CorePikkuMiddleware } from '@pikku/core'
import { pikkuMiddleware } from '@pikku/core'
import { toWebRequest } from '@pikku/core/http'
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
      const auth = (services as any).auth as BetterAuthInstance
      const webRequest = toWebRequest(http.request)
      const result = (await auth.api.getSession({
        headers: webRequest.headers,
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
