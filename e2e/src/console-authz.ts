import { pikkuAuth, addGlobalPermission, hasScopes } from '@pikku/core'
import { ADMIN_SCOPE_ROOT } from '@pikku/better-auth'
import type { UserSession } from './application-types.js'

/**
 * The console addon (`@pikku/addon-console`) exposes privileged RPCs —
 * credential read/write, on-disk source editing, package install — with no
 * authorization of their own. Global permissions are resolved in the callee's
 * package namespace, so a single global permission registered under the addon's
 * package gates EVERY one of its functions at once. Deny-by-default: only an
 * admin session passes. (Tag-level permissions were removed in #972; a
 * package-scoped `addGlobalPermission` is the replacement.)
 *
 * The consuming app decides who is an admin by who it grants the `admin` scope
 * to — see `src/seed-scopes.ts`. Scopes are resolved onto the session at the
 * auth boundary (`withResolvedScopes` inside `betterAuthSession`), and the
 * umbrella `admin` grant covers every capability nested beneath it. The addon
 * itself is never touched.
 */
const isConsoleAdmin = pikkuAuth(async (_services, session) =>
  hasScopes([ADMIN_SCOPE_ROOT], (session as UserSession | undefined)?.scopes)
)

addGlobalPermission([isConsoleAdmin], '@pikku/addon-console')
