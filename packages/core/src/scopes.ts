import type { CoreUserSession } from './types/core.types.js'
import { MissingScopeError } from './errors/errors.js'

const SEPARATOR = ':'
const WILDCARD = '*'

/**
 * Builds every grant that would satisfy `scope`: the scope itself, a wildcard
 * directly beneath it, a wildcard at each ancestor level, and each plain
 * ancestor id — holding a parent scope grants everything nested beneath it.
 *
 * For `admin:invoices:create` that is:
 *   admin:invoices:create, admin:invoices:create:*, *, admin:*, admin:invoices:*,
 *   admin, admin:invoices
 */
const satisfyingGrants = (scope: string): string[] => {
  const segments = scope.split(SEPARATOR)
  const grants = [scope, `${scope}${SEPARATOR}${WILDCARD}`]
  for (let i = 0; i < segments.length; i++) {
    grants.push([...segments.slice(0, i), WILDCARD].join(SEPARATOR))
  }
  for (let i = 1; i < segments.length; i++) {
    grants.push(segments.slice(0, i).join(SEPARATOR))
  }
  return grants
}

/**
 * Checks whether `held` satisfies a single required scope.
 *
 * A grant satisfies a requirement when it is the scope itself, a plain ancestor
 * (`admin` covers `admin:invoices:create`), a wildcard at or above it (`admin:*`
 * covers `admin` and `admin:invoices:create`), or the bare `*`. A narrower grant
 * never satisfies a broader requirement — `admin:invoices` does not grant
 * `admin`.
 */
const holds = (held: ReadonlySet<string>, scope: string): boolean =>
  satisfyingGrants(scope).some((grant) => held.has(grant))

/**
 * Verifies that a session holds every required scope, throwing on the first
 * one it does not.
 *
 * Scopes are an AND gate: every entry in `required` must be satisfied. This is
 * deliberately distinct from `permissions`, which OR together — a scope can
 * only ever narrow access, so adding one to a function can never widen it.
 *
 * Fails closed: a session without a `scopes` field, or no session at all,
 * satisfies nothing.
 *
 * @param required - Scopes the function declares. Empty means no gate.
 * @param session - The session to check. May be undefined.
 * @throws {MissingScopeError} Naming the first unsatisfied scope.
 */
export const verifyScopes = (
  required: readonly string[] | undefined,
  session: CoreUserSession | undefined
): void => {
  if (!required || required.length === 0) {
    return
  }

  const held = new Set(session?.scopes ?? [])
  for (const scope of required) {
    if (!holds(held, scope)) {
      throw new MissingScopeError(scope)
    }
  }
}
