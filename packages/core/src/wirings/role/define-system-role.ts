import type { CoreSystemRoles } from './role.types.js'

/**
 * No-op function for declaring system roles.
 * This exists purely for TypeScript type checking and will be tree-shaken.
 * The CLI extracts metadata via AST parsing and generates a `SystemRoleName`
 * union, so a persona naming an undeclared role fails the build.
 *
 * A system role is a role that ships with the product: the console may grant
 * it, but cannot rename, re-scope or delete it. Roles an admin composes in the
 * console are unaffected and are not declared here.
 *
 * Exactly one `defineSystemRole(...)` is allowed per codebase, so there is one
 * place to read the declared roles from and one place to add to. A second call
 * — even in the same file — fails the build.
 *
 * Removal is deliberately not destructive. Deleting a declaration leaves the
 * row in the store, marked undeclared and inert, until `pikku roles prune` —
 * the same additive contract `defineScope` has, and for the same reason: a
 * mid-deploy revocation is not something a code edit should be able to cause.
 *
 * @example
 * ```typescript
 * defineSystemRole({
 *   buyer: {
 *     displayName: 'Buyer',
 *     description: 'Can browse the catalogue and place orders',
 *     scopes: ['catalogue:read', 'orders:create'],
 *   },
 *   admin: {
 *     description: 'Everything',
 *     scopes: ['admin'],
 *   },
 * })
 * ```
 */
export const defineSystemRole = (_config: CoreSystemRoles): void => {}
