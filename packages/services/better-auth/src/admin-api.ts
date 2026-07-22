import type { BetterAuthInstance } from './define-auth.js'

/** The subset of the pikku HTTP wire this helper needs. */
export type AdminApiHttpWire = {
  request?: { headers(): Record<string, string> }
}

type AdminApi = Record<string, (opts: any) => Promise<any>>

/**
 * Call one of better-auth's `admin()` endpoints on behalf of the caller.
 *
 * The caller's request headers are forwarded rather than the call being made as
 * a trusted server, so authorization stays doubled: the pikku `scopes` gate on
 * the wrapping function decides *which* capability was granted, and better-auth
 * re-checks `user.role` for itself. Neither layer is load-bearing alone, so a
 * bug in one does not silently open the other.
 *
 * The role better-auth checks here is never granted directly — it is projected
 * from the caller's `admin:users:*` scopes by `syncProjectedAdminRole`, which
 * keeps scopes the single source of truth.
 *
 * Exported from this package rather than generated into the scaffold so the
 * generated functions stay one line each, and so a host can broker the same
 * endpoints from its own hand-written functions.
 */
export const callAdminApi = async <T>(
  auth: (() => Promise<BetterAuthInstance>) | undefined,
  http: AdminApiHttpWire | undefined,
  call: (api: AdminApi, headers: Headers) => Promise<T>
): Promise<T> => {
  if (!auth) {
    throw new Error(
      'User management requires better-auth to be wired (services.auth is missing)'
    )
  }
  const request = http?.request
  if (!request) {
    throw new Error(
      'User management must be called over HTTP so the caller can be authorized'
    )
  }

  const api = (await auth()).api as unknown as AdminApi
  if (typeof api.banUser !== 'function') {
    throw new Error(
      "better-auth is wired without the admin() plugin, so its user-management endpoints don't exist"
    )
  }

  return call(api, new Headers(request.headers()))
}
