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

/**
 * Declares scopes by id without describing them, so an app can grant a scope
 * (`defineSystemRole`, a function's `scopes`) whose full tree belongs to an
 * addon it has not wired. `wireAddon({ scopes })` does not declare anything: it
 * only requires the scope of the addon's functions, and the tree itself arrives
 * with the addon's metadata. Declaring by id lets an app grant
 * `pikku:console` without wiring `@pikku/addon-console`, which would otherwise
 * be the only way to make that grant valid.
 *
 * Each id declares that node and its ancestors. When the addon IS wired, its
 * own description wins and this call adds nothing it does not already have; the
 * two never conflict, unlike a second `defineScope` for the same root.
 *
 * @example
 * ```typescript
 * declareScopes(['pikku:console'])
 * ```
 */
export const declareScopes = (_ids: string[]): void => {}
