import type { CoreScopes } from './scope.types.js'

/**
 * No-op function for declaring scopes.
 * This exists purely for TypeScript type checking and will be tree-shaken.
 * The CLI extracts metadata via AST parsing and generates a `ScopeId` union,
 * so a function referencing an undeclared scope fails the build.
 *
 * Scopes are keyed by segment at every level: a scope is named by its key, and
 * its value describes it. Every node is grantable — the declaration below
 * yields `admin`, `admin:invoices`, `admin:invoices:create`,
 * `admin:invoices:void` and `billing`.
 *
 * @example
 * ```typescript
 * wireScope({
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
export const wireScope = (_config: CoreScopes): void => {}
