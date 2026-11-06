import type { CoreFeatureFlags } from './flag.types.js'

/**
 * No-op function for declaring feature flags.
 * This exists purely for TypeScript type checking and will be tree-shaken.
 * The CLI extracts metadata via AST parsing and generates a `FeatureFlagName`
 * union, so `flags.calList` is a compile error rather than a silent `false`.
 *
 * That typing is load-bearing rather than a convenience: in a browser a flag
 * the map does not hold reads `false`, so a typo'd name hides its feature
 * permanently and leaves every test, screenshot and gate green. An untyped key
 * makes a missing product indistinguishable from a working one.
 *
 * A flag's life is read off its store row, and `admin:flagSync` is what creates
 * the row. Before that the flag is on for everyone, in a function and in a
 * client. The first sync adds it switched off, and a deploy through Studio
 * syncs, so a new flag goes dark at its first deploy until someone turns it on.
 * Turning one off by hand before any sync works too: the write creates the row.
 *
 * Guard a function with `featureFlag: 'name'` on `pikkuFunc`: the runner checks
 * it on every call and answers 503 with `FeatureUnavailableError`. It is
 * availability, never authorization. `scopes` is what decides who may call.
 * `anyOf` is not enforced by that gate either; it only decides what the
 * generated `GET /feature-flags` (`scaffold.featureFlags`) tells a client to
 * show. Operators change flags with `admin:flagSetEnabled`, `admin:flagSetRollout`
 * and `admin:flagSetOverride` from `@pikku/addon-admin`.
 *
 * Removal is deliberately not destructive. Deleting a declaration leaves the
 * row in the store, marked undeclared and inert, until `admin:flagPrune` —
 * the same additive contract `defineScope` and `defineSystemRole` have, and for
 * the same reason: a mid-deploy revocation is not something a code edit should
 * be able to cause.
 *
 * @example snippet: defineFeatureFlags
 */
export const defineFeatureFlags = (_config: CoreFeatureFlags): void => {}
