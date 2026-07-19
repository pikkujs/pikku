import { pikkuAuth, addGlobalPermission } from '@pikku/core'
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
 * The consuming app decides who is an admin by how it maps the session — see
 * `src/middleware.ts`, whose `betterAuthSession` carries Better Auth's `role`
 * into the pikku session. The addon itself is never touched.
 */
const isConsoleAdmin = pikkuAuth(
  async (_services, session) =>
    (session as UserSession | undefined)?.role === 'admin'
)

addGlobalPermission([isConsoleAdmin], '@pikku/addon-console')
