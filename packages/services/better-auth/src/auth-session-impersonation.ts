import type { CoreServices, CoreUserSession } from '@pikku/core/types'
import { ADMIN_SCOPES, userHoldsScopes } from './auth-scopes.js'

/** Where a target user id arrives when no `header` is configured. */
export const DEFAULT_IMPERSONATION_HEADER = 'x-pikku-impersonate-user-id'

/** The `{ user, session }` shape both session paths resolve before mapping. */
export type SessionLike = { user: any; session: any }

export type ImpersonationOptions = {
  /** Header carrying the target user id. Defaults to `x-pikku-impersonate-user-id`. */
  header?: string
  /**
   * Gate the real caller against impersonating. Defaults to a Fabric operator
   * row, or the `admin:impersonate` scope resolved through the registered
   * `ScopeService`.
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
 * The default gate admits two callers. A `fabric: true` row is one: that column
 * is set by nothing but {@link fabric}'s sign-in, which writes it only after
 * verifying an RS256 token against the stage's public key, so the row's very
 * existence is the authorization — and unlike a scope it needs no ScopeService
 * wired, which no app template actually does. Otherwise the caller must hold
 * `admin:impersonate`, resolved through the registered `ScopeService`; that
 * half fails closed, since with no ScopeService nothing can hold the scope.
 */
export const resolveImpersonatedSession = async (
  caller: SessionLike,
  impersonation: ImpersonationOptions,
  services: CoreServices,
  getHeader: (name: string) => string | undefined | null,
  mapSession?: MapSession
): Promise<CoreUserSession | null> => {
  const header = impersonation.header ?? DEFAULT_IMPERSONATION_HEADER
  const targetId = getHeader(header)
  // No header, or impersonating your own id, is a no-op.
  if (!targetId || targetId === caller.user.id) {
    return null
  }

  const canImpersonate =
    impersonation.canImpersonate ??
    ((result: SessionLike, coreServices: CoreServices) =>
      result.user?.fabric === true ||
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

let warnedUnconfigured = false

/**
 * Say so when a request carries an impersonation header that nothing is
 * configured to honour — shared by both session middlewares.
 *
 * `impersonation` is opt-in, and omitting it is silent: the header is read by
 * nobody and the request runs as the real caller. That is exactly what a
 * deployed stage's scenario and virtual-user runs do — they sign in with a
 * Fabric operator token and name the persona in this header — so an app that
 * never passed the option runs every persona as the operator, a row with no
 * membership anywhere, and the only symptom is assertions failing against
 * data the persona should have been able to see.
 *
 * Once per process: a scenario run sends the header on every request, and the
 * misconfiguration it reports does not change between them.
 */
export const warnImpersonationUnconfigured = (
  services: CoreServices,
  getHeader: (name: string) => string | undefined | null
): void => {
  if (warnedUnconfigured) {
    return
  }
  const targetId = getHeader(DEFAULT_IMPERSONATION_HEADER)
  if (!targetId) {
    return
  }
  warnedUnconfigured = true
  services.logger?.warn(
    `better-auth: a request carried ${DEFAULT_IMPERSONATION_HEADER}: ${targetId}, but this session middleware was registered without an \`impersonation\` option, so the header was ignored and the request ran as the caller that signed in. Pass \`impersonation: { loadUser: (userId, services) => ... }\` to honour it.`
  )
}
