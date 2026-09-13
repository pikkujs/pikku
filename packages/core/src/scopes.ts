import type { CoreUserSession } from './types/core.types.js'
import { MissingScopeError } from './errors/errors.js'

const SEPARATOR = ':'
const WILDCARD = '*'

/**
 * Every grant that would satisfy `scope`: the scope itself, a wildcard
 * directly beneath it, a wildcard at each ancestor level, and each plain
 * ancestor id.
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

const holds = (held: ReadonlySet<string>, scope: string): boolean =>
  satisfyingGrants(scope).some((grant) => held.has(grant))

/** The first required scope `held` does not satisfy, or `null`. Fails closed. */
const firstUnsatisfied = (
  required: readonly string[] | undefined,
  held: Iterable<string> | undefined
): string | null => {
  if (!required || required.length === 0) {
    return null
  }

  const grants = new Set(held ?? [])
  for (const scope of required) {
    if (!holds(grants, scope)) {
      return scope
    }
  }
  return null
}

/**
 * The non-throwing counterpart to {@link verifyScopes}, for deciding rather
 * than enforcing. Fails closed; an empty `required` is satisfied by anything.
 */
export const hasScopes = (
  required: readonly string[] | undefined,
  held: Iterable<string> | undefined
): boolean => firstUnsatisfied(required, held) === null

/**
 * True when `held` satisfies AT LEAST ONE of `candidates`, with the same
 * parent/wildcard rules as {@link hasScopes}.
 *
 * The OR counterpart to {@link hasScopes}, for a feature flag's `anyOf`: a flag
 * usually reveals one entry point several roles can reach, so requiring all of
 * them would hide it from everyone who can actually use it. Fails closed — an
 * empty or absent `candidates` is satisfied by nothing, because "any of
 * nothing" has no member that could hold.
 */
export const hasAnyScope = (
  candidates: readonly string[] | undefined,
  held: Iterable<string> | undefined
): boolean => {
  if (!candidates || candidates.length === 0) {
    return false
  }
  const grants = new Set(held ?? [])
  return candidates.some((scope) => holds(grants, scope))
}

/**
 * Throws {@link MissingScopeError} naming the first scope the session does not
 * hold. Fails closed: no session, or a session without `scopes`, satisfies
 * nothing.
 */
export const verifyScopes = (
  required: readonly string[] | undefined,
  session: CoreUserSession | undefined
): void => {
  const missing = firstUnsatisfied(required, session?.scopes)
  if (missing !== null) {
    throw new MissingScopeError(missing)
  }
}
