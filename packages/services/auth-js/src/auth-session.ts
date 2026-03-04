import { decode } from '@auth/core/jwt'
import type { CoreUserSession, CorePikkuMiddleware } from '@pikku/core'
import { pikkuMiddleware } from '@pikku/core'

type AuthJsSessionOptionsBase = {
  cookieName?: string
  mapSession?: (claims: any) => CoreUserSession
}

type AuthJsSessionOptions = AuthJsSessionOptionsBase &
  ({ secret: string } | { secretId: string })

/**
 * Middleware that reads Auth.js session cookies and bridges them into Pikku sessions.
 *
 * Usage:
 * ```typescript
 * // With a secret ID (resolved from services.secrets at request time)
 * addHTTPMiddleware('*', [
 *   authJsSession({
 *     secretId: 'AUTH_SECRET',
 *     mapSession: (claims) => ({ userId: claims.sub, email: claims.email }),
 *   })
 * ])
 *
 * // With a direct secret (for development/testing)
 * addHTTPMiddleware('*', [
 *   authJsSession({
 *     secret: 'dev-secret',
 *     mapSession: (claims) => ({ userId: claims.sub }),
 *   })
 * ])
 * ```
 */
export const authJsSession = (
  options: AuthJsSessionOptions
): CorePikkuMiddleware => {
  const { cookieName, mapSession } = options
  return pikkuMiddleware(
    async (
      services,
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
          const secret =
            'secret' in options
              ? options.secret
              : await services.secrets.getSecret(options.secretId)
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
