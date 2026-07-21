import type { CoreServices, CoreUserSession } from '@pikku/core'
import { ADMIN_SCOPES, userHoldsScopes } from './auth-scopes.js'

/** The `{ user, session }` shape both session paths resolve before mapping. */
export type SessionLike = { user: any; session: any }

export type ImpersonationOptions = {
  /** Header carrying the target user id. Defaults to `x-pikku-impersonate-user-id`. */
  header?: string
  /**
   * Gate the real caller against impersonating. Defaults to requiring the
   * `admin:impersonate` scope, resolved through the registered `ScopeService`.
   */
  canImpersonate?: (
    result: SessionLike,
    services: CoreServices
  ) => boolean | Promise<boolean>
  /** Load the target user by id; return falsy if it doesn't exist. */
  loadUser: (userId: string, services: CoreServices) => any | Promise<any>
}

export type MapSession = (
  result: SessionLike,
  services: CoreServices
) => CoreUserSession | Promise<CoreUserSession>

/**
 * Resolve an impersonated session for an authenticated caller — shared by the
 * stateful ({@link betterAuthSession}) and stateless
 * ({@link betterAuthStatelessSession}) middlewares so both behave identically.
 *
 * Returns the session to set when the caller is authorized and the target
 * exists; returns `null` when impersonation does not apply (no header, a
 * self-target, the gate denies, or an unknown target) so the caller falls back
 * to the real session. An unknown target is logged at `warn` — it is NOT an
 * error. Hook errors (`canImpersonate`/`loadUser`) propagate by design.
 *
 * The default gate is the `admin:impersonate` scope, resolved for the *caller*
 * through the registered `ScopeService`. It fails closed: with no ScopeService
 * there is nothing to hold the scope, so impersonation is denied.
 */
export const resolveImpersonatedSession = async (
  caller: SessionLike,
  impersonation: ImpersonationOptions,
  services: CoreServices,
  getHeader: (name: string) => string | undefined | null,
  mapSession?: MapSession
): Promise<CoreUserSession | null> => {
  const header = impersonation.header ?? 'x-pikku-impersonate-user-id'
  const targetId = getHeader(header)
  // No header, or impersonating your own id, is a no-op.
  if (!targetId || targetId === caller.user.id) {
    return null
  }

  const canImpersonate =
    impersonation.canImpersonate ??
    ((result: SessionLike, coreServices: CoreServices) =>
      userHoldsScopes(
        result.user?.id,
        [ADMIN_SCOPES.impersonate],
        coreServices
      ))
  if (!(await canImpersonate(caller, services))) {
    return null
  }

  const targetUser = await impersonation.loadUser(targetId, services)
  if (!targetUser) {
    services.logger?.warn(
      `better-auth impersonation: target user ${targetId} not found; running as ${caller.user.id}`
    )
    return null
  }

  services.logger?.info(
    `better-auth impersonation: ${caller.user.id} running as ${targetId}`
  )
  return mapSession
    ? await mapSession({ user: targetUser, session: caller.session }, services)
    : ({ userId: targetUser.id } as CoreUserSession)
}
