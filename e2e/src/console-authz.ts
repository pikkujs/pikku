import { pikkuAuth } from '@pikku/core/function'
import { addGlobalPermission } from '@pikku/core/middleware'
import { hasScopes } from '@pikku/core/scope'
import type { UserSession } from './application-types.js'

/**
 * The console addon (`@pikku/addon-console`) exposes privileged RPCs —
 * credential read/write, on-disk source editing, package install — with no
 * authorization of their own. Global permissions are resolved in the callee's
 * package namespace, so a single global permission registered under the addon's
 * package gates EVERY one of its functions at once. Deny-by-default: only a
 * console-scoped session passes. (Tag-level permissions were removed in #972; a
 * package-scoped `addGlobalPermission` is the replacement.)
 *
 * The consuming app decides who reaches the console by who it grants
 * `pikku:console` to — see `src/seed-scopes.ts`. That is the console's own
 * root, not `admin`: administering the application lives in
 * `@pikku/addon-admin` under `admin`, and the two grants say nothing about each
 * other. Scopes are resolved onto the session at the auth boundary
 * (`withResolvedScopes` inside `betterAuthSession`), and the grant covers every
 * capability nested beneath it. The addon itself is never touched.
 */
const CONSOLE_SCOPE_ROOT = 'pikku:console'

const isConsoleAdmin = pikkuAuth(async (_services, session) =>
  hasScopes([CONSOLE_SCOPE_ROOT], (session as UserSession | undefined)?.scopes)
)

addGlobalPermission([isConsoleAdmin], '@pikku/addon-console')
