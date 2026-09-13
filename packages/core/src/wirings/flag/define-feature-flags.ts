import type { CoreFeatureFlags } from './flag.types.js'

/**
 * No-op function for declaring feature flags.
 * This exists purely for TypeScript type checking and will be tree-shaken.
 * The CLI extracts metadata via AST parsing and generates a `FeatureFlagName`
 * union, so `flags.calList` is a compile error rather than a silent `false`.
 *
 * That typing is load-bearing rather than a convenience: flags fail closed, so
 * a typo'd flag reads `false`, hides its feature permanently, and leaves every
 * test, screenshot and gate green. An untyped key makes a missing product
 * indistinguishable from a working one.
 *
 * Removal is deliberately not destructive. Deleting a declaration leaves the
 * row in the store, marked undeclared and inert, until `pikku flags prune` —
 * the same additive contract `defineScope` and `defineSystemRole` have, and for
 * the same reason: a mid-deploy revocation is not something a code edit should
 * be able to cause.
 *
 * @example
 * ```typescript
 * defineFeatureFlags({
 *   takeInBike: {
 *     description: 'Book a bike in at the counter',
 *     anyOf: ['bikes:intake'],
 *   },
 *   aiAssistant: {
 *     description: 'The assistant panel',
 *     // no anyOf — the switch is the whole answer
 *   },
 * })
 * ```
 */
export const defineFeatureFlags = (_config: CoreFeatureFlags): void => {}
