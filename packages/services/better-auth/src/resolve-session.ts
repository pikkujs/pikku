import type {
  CoreServices,
  CoreUserSession,
  PikkuWire,
} from '@pikku/core/types'
import { defaultSession } from './default-session.js'
import { stampVirtualUserFlag } from './stamp-virtual-user-flag.js'
import {
  resolveImpersonatedSession,
  warnImpersonationUnconfigured,
  type ImpersonationOptions,
  type MapSession,
  type SessionLike,
} from './auth-session-impersonation.js'
import { withResolvedScopes } from './auth-session-scopes.js'
import { isSecretForbidden, isSecretNotFound } from './secret-not-found.js'

/**
 * Whether the chain already holds a session. `session` is the snapshot taken
 * when the wire was built and is never updated; `getSession()` is the live
 * value an earlier middleware may have set.
 *
 * See `a-live-session-is-checked-before-a-session-middleware-resolves-one.md`.
 */
export const hasLiveSession = async (
  wire: Pick<PikkuWire, 'session' | 'getSession'>
): Promise<boolean> =>
  Boolean(wire.session) || Boolean(await wire.getSession?.())

/**
 * Reads the better-auth signing secret, or `undefined` when this middleware
 * should stand down without it.
 *
 * Forbidden is the normal case on an addon dispatch and stays silent; missing
 * is a misconfiguration and is logged; anything else is an outage and throws.
 * See `a-session-middleware-stands-down-where-it-cannot-authenticate.md`.
 */
export const readSessionSecret = async (
  services: CoreServices,
  secretId: string,
  middlewareName: string
): Promise<string | undefined> => {
  try {
    const secret = await services.secrets?.getSecret(secretId)
    return secret?.reveal() || undefined
  } catch (e) {
    if (isSecretForbidden(e)) {
      return undefined
    }
    if (!isSecretNotFound(e)) {
      throw e
    }
    services.logger?.error(
      `${middlewareName}: secret '${secretId}' not found — session middleware skipped. Ensure ${secretId} is configured.`
    )
    return undefined
  }
}

/**
 * The tail every better-auth session middleware shares once it holds an
 * authenticated `{ user, session }`: impersonation (or the warning that it is
 * not configured), the app's `mapSession` or the default mapping, the
 * `virtualUser` stamp, scope resolution, and finally `setSession`.
 *
 * `mapSession` and impersonation hooks are caller code, so their errors
 * propagate — see `a-session-read-that-fails-is-an-error-not-anonymous.md`.
 */
export const resolveAndSetSession = async <R extends SessionLike>({
  result,
  services,
  getHeader,
  setSession,
  mapSession,
  impersonation,
}: {
  result: R
  services: CoreServices
  getHeader: (name: string) => string | undefined | null
  setSession: (session: CoreUserSession) => Promise<void> | void
  mapSession?: (
    result: R,
    services: CoreServices
  ) => CoreUserSession | Promise<CoreUserSession>
  impersonation?: ImpersonationOptions
}): Promise<void> => {
  if (impersonation) {
    const impersonated = await resolveImpersonatedSession(
      result,
      impersonation,
      services,
      getHeader,
      mapSession as MapSession | undefined
    )
    if (impersonated) {
      // Scopes resolve for the impersonated userId, not the admin's — an
      // impersonated session runs as the target, with the target's rights.
      await setSession(await withResolvedScopes(impersonated, services))
      return
    }
  } else {
    warnImpersonationUnconfigured(services, getHeader)
  }

  const mapped = mapSession
    ? await mapSession(result, services)
    : defaultSession(result)
  await setSession(
    await withResolvedScopes(
      stampVirtualUserFlag(mapped, result.user),
      services
    )
  )
}
