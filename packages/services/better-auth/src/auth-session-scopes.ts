import type { ScopeService } from '@pikku/core/services'
import type { CoreServices, CoreUserSession } from '@pikku/core/types'
import type { ScopesCache } from './scopes-cookie.js'

/**
 * Resolve the session user's scopes from the registered {@link ScopeService}.
 *
 * This is the session boundary: `function-runner` reads `session.scopes` and
 * does no I/O of its own beyond the one re-read a function requiring a `live`
 * scope asks for (see `withLiveScopes` in core).
 *
 * With no `cache`, or a TTL of zero, every request reads the store, so a grant
 * change is visible on the next request. With a `cache`, a snapshot younger
 * than its TTL is trusted instead and the store is read once the snapshot ages
 * out, so a grant change can take up to a TTL to arrive. Declare a scope
 * `live` and the functions that require it bypass the snapshot entirely.
 *
 * Either way the scopes are stamped with `scopesResolvedAt`, which is what
 * marks them as a resolved snapshot. Resolution is skipped, and grants may then
 * never reach the session, when no `ScopeService` is registered or the session
 * has no `userId`.
 *
 * A `scopes` set by `mapSession`/`mapKey` carries no stamp and is
 * authoritative: it is never overridden, including an empty one. That is what
 * lets a caller mint a restricted API key that does *not* inherit everything
 * its owning user can do; resolution only ever fills an absence, it cannot
 * widen a deliberate restriction.
 */
export const withResolvedScopes = async (
  session: CoreUserSession,
  services: CoreServices,
  cache?: ScopesCache
): Promise<CoreUserSession> => {
  const { scopeService } = services

  if (!scopeService || !session.userId) {
    return session
  }
  if (session.scopes && session.scopesResolvedAt === undefined) {
    return session
  }

  const now = Date.now()
  const ttlMs = (cache?.ttlSeconds ?? 0) * 1000
  const fresh = (at: number) => at <= now && now - at < ttlMs

  if (session.scopes && session.scopesResolvedAt !== undefined) {
    if (fresh(session.scopesResolvedAt)) {
      return session
    }
  } else if (cache && ttlMs > 0) {
    const held = await cache.read()
    if (held && held.userId === session.userId && fresh(held.at)) {
      return { ...session, scopes: held.scopes, scopesResolvedAt: held.at }
    }
  }

  const scopes = await scopeService.resolveScopes(session.userId)
  await cache?.write({ userId: session.userId, scopes, at: now })
  return { ...session, scopes, scopesResolvedAt: now }
}
