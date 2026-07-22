import type { CoreServices } from '@pikku/core'
import type { BetterAuthInstance } from './define-auth.js'
import { projectedAdminRole } from './auth-scopes.js'

/** better-auth's own fallback when `admin()` is configured without one. */
const BETTER_AUTH_DEFAULT_ROLE = 'user'

/**
 * The `admin()` plugin's configured `defaultRole`, or `undefined` when the
 * plugin is not wired at all.
 *
 * Detected from the live instance rather than asked of the host: an app that
 * has no `admin()` plugin has no `role` column, and writing to it would fail.
 * Auto-detection keeps the projection from being a flag someone can forget to
 * set while shipping the drift it exists to prevent.
 */
const adminPluginDefaultRole = (
  auth: BetterAuthInstance
): string | undefined => {
  const plugins = (auth as any).options?.plugins as
    | Array<{ id?: string }>
    | undefined
  const plugin = plugins?.find((p) => p?.id === 'admin')
  if (!plugin) {
    return undefined
  }
  return (plugin as any).options?.defaultRole ?? BETTER_AUTH_DEFAULT_ROLE
}

/**
 * Bring `user.role` in line with the scopes the user actually holds.
 *
 * better-auth's `admin()` endpoints authorize against `user.role`, but in pikku
 * scopes are the source of truth — so the column is kept as a projection of
 * them (see {@link projectedAdminRole}). Syncing here, at the session boundary,
 * means one code path covers every way a grant can change: a direct scope
 * grant, a role membership, an edit to a role's scope set, or a prune. There is
 * nothing to invalidate and no fan-out to miss.
 *
 * Takes the better-auth user row the caller already loaded rather than
 * re-reading it, so the steady state costs nothing: the write happens only on
 * the first request after the projection actually changes.
 *
 * Failures are logged and swallowed. A user whose role has drifted is refused
 * by better-auth's own gate, which is the safe direction; taking the request
 * down instead would turn a stale column into an outage.
 */
export const syncProjectedAdminRole = async (
  services: CoreServices,
  user: { id?: string; role?: string | null } | undefined,
  scopes: Iterable<string> | undefined
): Promise<void> => {
  if (!user?.id) {
    return
  }

  try {
    const auth = (await (services as any).auth()) as BetterAuthInstance
    const defaultRole = adminPluginDefaultRole(auth)
    if (defaultRole === undefined) {
      return
    }

    const expected = projectedAdminRole(scopes, defaultRole)
    if ((user.role ?? defaultRole) === expected) {
      return
    }

    const ctx = await auth.$context
    await ctx.internalAdapter.updateUser(user.id, { role: expected })
    services.logger?.info(
      `better-auth: projected user ${user.id} role '${user.role ?? ''}' -> '${expected}' from scopes`
    )
  } catch (e: any) {
    services.logger?.warn(
      `better-auth: could not project admin role for ${user.id}: ${e?.message ?? e}`
    )
  }
}
