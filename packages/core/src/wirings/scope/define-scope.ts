import type { CoreScopes } from './scope.types.js'

/**
 * Declares scopes. The body is a no-op that tree-shakes away — the CLI reads
 * the call by AST and generates a `ScopeId` union, so a function referencing an
 * undeclared scope fails the build.
 *
 * Scopes are keyed by segment at every level: a scope is named by its key, and
 * its value describes it. Every node is grantable — the declaration below
 * yields `admin`, `admin:invoices`, `admin:invoices:create`,
 * `admin:invoices:void` and `billing`.
 *
 * Exactly one `defineScope(...)` is allowed per codebase, so there is one place
 * to read the declared scopes from and one place to add to. A second call —
 * even in the same file — fails the build.
 *
 * @example
 * ```typescript
 * defineScope({
 *   admin: {
 *     displayName: 'Administration',
 *     description: 'Administrative access',
 *     scopes: {
 *       invoices: {
 *         description: 'Invoice management',
 *         scopes: {
 *           create: { description: 'Create invoices' },
 *           void: { description: 'Void invoices' },
 *         },
 *       },
 *     },
 *   },
 *   billing: {},
 * })
 * ```
 */
export const defineScope = (_config: CoreScopes): void => {}
