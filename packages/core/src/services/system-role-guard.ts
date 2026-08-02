import {
  SystemRoleImmutableError,
  SystemRoleShadowedError,
} from '../errors/errors.js'
import type { Role } from './scope-service.js'

/**
 * The guards a {@link ScopeService} implementation must apply before mutating
 * a role.
 *
 * Shared rather than left to each implementation because the rule is a
 * contract, not a policy: a store that lets the console delete `buyer` makes
 * every persona and scenario written against `buyer` silently stop testing
 * what it claims to, and nothing fails at the point of the mistake. Two
 * implementations disagreeing about that would be worse than either rule.
 *
 * `isSystemRole` is passed in rather than a role list, so an implementation can
 * answer it from a column, a cached set, or a query, whichever is cheap.
 */
export type IsSystemRole = (name: string) => boolean | Promise<boolean>

/**
 * Refuses a destructive or re-scoping operation against a declared role.
 *
 * @param operation a verb phrase for the message, e.g. `'delete role'`.
 */
export const assertRoleIsMutable = async (
  name: string,
  isSystemRole: IsSystemRole,
  operation: string
): Promise<void> => {
  if (await isSystemRole(name)) {
    throw new SystemRoleImmutableError(name, operation)
  }
}

/**
 * Refuses a new custom role that would shadow a declared one.
 */
export const assertRoleNameAvailable = async (
  name: string,
  isSystemRole: IsSystemRole
): Promise<void> => {
  if (await isSystemRole(name)) {
    throw new SystemRoleShadowedError(name)
  }
}

/**
 * Why the console must render a role as locked, or `null` when it is editable.
 *
 * Returned rather than a boolean so the UI shows a reason instead of a
 * disabled button with no explanation — the difference between a user filing a
 * bug and a user editing the declaration.
 */
export const roleLockReason = (role: Role): string | null => {
  if (!role.system) {
    return null
  }
  if (role.declared === false) {
    return (
      `'${role.name}' was declared in code and that declaration has been removed. ` +
      `It is inert: still held by its current members, not offered for new grants. ` +
      `Run 'pikku roles prune' to remove it.`
    )
  }
  return (
    `'${role.name}' is declared in code with defineSystemRole. ` +
    `Edit the declaration to change what it grants.`
  )
}
