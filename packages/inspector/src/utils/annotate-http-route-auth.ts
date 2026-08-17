import type { InspectorState } from '../types.js'
import { resolveFunctionMeta } from './resolve-function-meta.js'

/**
 * Resolve, per HTTP route, whether reaching it requires a session.
 *
 * Four separate places can demand one — the function's `sessionless`, the
 * function's own `auth`, the route's (or its group's) `auth`, and the addon the
 * function belongs to — and they combine with OR: any of them is enough. Until
 * this was written down, "which routes are open?" could only be answered by
 * joining all four by hand, and getting the join wrong reads an open route as a
 * closed one, which is the direction that costs something.
 *
 * A scope gate counts as requiring a session. Scopes are checked against the
 * session's and fail closed, so an anonymous caller is rejected either way; not
 * counting them would mark a route open that nobody can reach anonymously.
 *
 * Anything not statically knowable resolves to requiring a session, matching
 * `validateExposedFunctionsGated`: an over-cautious `true` costs a route that
 * looks stricter than it is, a wrong `false` costs an audit.
 *
 * knowledge: decisions/security/addon-auth-and-tags-only-tighten.md
 */
export function annotateHttpRouteAuth(state: InspectorState): void {
  const gatedPackages = packagesGatedByTheirAddon(state)

  for (const routes of Object.values(state.http?.meta ?? {})) {
    for (const route of Object.values(routes)) {
      const meta = resolveFunctionMeta(state, route.pikkuFuncId)

      route.requiresSession =
        // A pikkuFunc always requires a session, on every path.
        meta?.sessionless === false ||
        meta?.auth === true ||
        (meta?.scopes?.length ?? 0) > 0 ||
        route.auth === true ||
        (route.packageName !== undefined &&
          gatedPackages.has(route.packageName))
    }
  }
}

/** Packages whose `wireAddon` demands a session from everything inside them. */
function packagesGatedByTheirAddon(state: InspectorState): Set<string> {
  const gated = new Set<string>()
  for (const declaration of state.rpc?.wireAddonDeclarations?.values() ?? []) {
    if (!declaration.package) continue
    if (declaration.auth === true || (declaration.scopes?.length ?? 0) > 0) {
      gated.add(declaration.package)
    }
  }
  return gated
}
