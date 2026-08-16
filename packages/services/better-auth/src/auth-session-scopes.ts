import type { ScopeService } from '@pikku/core/services'
import type { CoreServices, CoreUserSession } from '@pikku/core/types'

/**
 * Resolve the session user's scopes from the registered {@link ScopeService}.
 *
 * This is the session boundary, and deliberately the only place scopes are
 * fetched: `function-runner` reads `session.scopes` and never does I/O. Because
 * the session middleware already runs per request, a grant change is visible on
 * the very next request with no re-login — there is no cache to invalidate.
 *
 * That holds only when this actually resolves. Both conditions below skip
 * resolution entirely, so a grant made through the console can land in the
 * store and never reach the session; any UI or CLI copy promising "takes
 * effect on their next request" has to carry the same caveat.
 *
 * A `scopes` set by `mapSession`/`mapKey` is authoritative and is never
 * overridden — including an empty one. That is what lets a caller mint a
 * restricted API key that does *not* inherit everything its owning user can do;
 * resolution only ever fills an absence, it cannot widen a deliberate
 * restriction.
 *
 * Inert when no `ScopeService` is registered.
 */
export const withResolvedScopes = async (
  session: CoreUserSession,
  services: CoreServices
): Promise<CoreUserSession> => {
  const scopeService = (services as any).scopeService as
    ScopeService | undefined

  if (!scopeService || session.scopes || !session.userId) {
    return session
  }

  return {
    ...session,
    scopes: await scopeService.resolveScopes(session.userId),
  }
}
