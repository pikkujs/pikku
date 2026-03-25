import { pikkuMiddlewareFactory } from '../types/core.types.js'
import { pikkuMiddleware } from '../types/core.types.js'
import { defaultPikkuUserIdResolver } from '../services/pikku-user-id.js'
import type { PikkuUserIdResolver } from '../services/pikku-user-id.js'

/**
 * Middleware that loads credentials for the current user from the CredentialService
 * and populates them on the wire via `setCredential()`.
 *
 * @param options.names - Optional list of credential names to load. If omitted, loads all.
 * @param options.userIdResolver - Optional custom resolver for pikkuUserId. Defaults to `defaultPikkuUserIdResolver`.
 *
 * @example
 * ```typescript
 * import { loadCredentials } from '@pikku/core/middleware'
 *
 * // Load all credentials for the current user
 * addHTTPMiddleware('*', [loadCredentials()])
 *
 * // Load specific credentials only
 * addHTTPMiddleware('*', [loadCredentials({ names: ['stripe', 'google-sheets'] })])
 * ```
 */
export const loadCredentials = pikkuMiddlewareFactory<{
  names?: string[]
  userIdResolver?: PikkuUserIdResolver
}>(({ names, userIdResolver } = {}) =>
  pikkuMiddleware(async (services, wire, next) => {
    const credentialService = (services as any).credentialService
    if (!credentialService) {
      return next()
    }

    const resolver = userIdResolver ?? defaultPikkuUserIdResolver
    const userId = resolver(wire)
    if (!userId) {
      return next()
    }

    wire.pikkuUserId = userId

    if (names) {
      for (const name of names) {
        const cred = await credentialService.get(name, userId)
        if (cred) {
          wire.setCredential?.(name, cred)
        }
      }
    } else {
      const allCreds = await credentialService.getAll(userId)
      for (const [name, value] of Object.entries(allCreds)) {
        wire.setCredential?.(name, value)
      }
    }

    return next()
  })
)
