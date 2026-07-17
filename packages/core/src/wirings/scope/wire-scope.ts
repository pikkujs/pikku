import type { CoreScope } from './scope.types.js'

/**
 * No-op function for declaring scopes.
 * This exists purely for TypeScript type checking and will be tree-shaken.
 * The CLI extracts metadata via AST parsing and generates a `ScopeId` union,
 * so a function referencing an undeclared scope fails the build.
 *
 * Every node is grantable: the declaration below yields `admin`,
 * `admin:invoices`, `admin:invoices:create` and `admin:invoices:void`.
 *
 * @example
 * ```typescript
 * wireScope({
 *   name: 'admin',
 *   displayName: 'Administration',
 *   description: 'Administrative access',
 *   scopes: {
 *     invoices: {
 *       description: 'Invoice management',
 *       scopes: {
 *         create: { description: 'Create invoices' },
 *         void: { description: 'Void invoices' },
 *       },
 *     },
 *   },
 * })
 * ```
 */
export const wireScope = (_config: CoreScope): void => {}
