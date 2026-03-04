import { decode } from '@auth/core/jwt'
import type { CoreUserSession, CorePikkuMiddleware } from '@pikku/core'
import { pikkuMiddleware } from '@pikku/core'

type AuthJsSessionOptions = {
  secret: string
  cookieName?: string
  mapSession?: (claims: any) => CoreUserSession
}

/**
 * Middleware that reads Auth.js session cookies and bridges them into Pikku sessions.
 *
 * Usage:
 * ```typescript
 * addHTTPMiddleware('*', [
 *   authJsSession({
 *     secret: process.env.AUTH_SECRET!,
 *     mapSession: (claims) => ({ userId: claims.sub, email: claims.email }),
 *   })
 * ])
 * ```
 */
export const authJsSession = (
  options: AuthJsSessionOptions
): CorePikkuMiddleware => {
  const { secret, cookieName, mapSession } = options
  return pikkuMiddleware(
    async (
      _services,
      { http, setSession, hasSessionChanged, session },
      next
    ) => {
      if (!http?.request || !setSession || session) {
        return next()
      }

      const name = cookieName ?? 'authjs.session-token'
      const secureName = `__Secure-${name}`
      const cookieValue =
        http.request.cookie(secureName) ?? http.request.cookie(name)

      if (cookieValue) {
        try {
          const decoded = await decode({
            token: cookieValue,
            secret,
            salt: http.request.cookie(secureName) ? secureName : name,
          })
          if (decoded) {
            setSession(
              mapSession
                ? mapSession(decoded)
                : { userId: decoded.sub as string }
            )
          }
        } catch {
          // Invalid or expired token — proceed without session
        }
      }

      await next()

      if (hasSessionChanged?.()) {
        throw new Error(
          'Session is read-only when using Auth.js. Use Auth.js routes (/auth/session) to modify sessions.'
        )
      }
    }
  )
}
