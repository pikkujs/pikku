import type { ScopeId } from '#pikku/scopes/pikku-scopes.gen.js'

/**
 * Which scopes turn each UI feature on.
 *
 * A feature hides a control; it never protects anything. The guarantee is the
 * `scopes:` field on the function that control calls, and a feature listed here
 * without that gate is an app that only looks gated. Semantics are OR: any one
 * of the listed scopes is enough.
 */
export const FEATURES = {
  catalogueEditor: ['catalogue:write'],
  refundButton: ['orders:refund'],
  salesReports: ['reports:read'],
  orderHistory: ['orders:read'],
} as const satisfies Record<string, readonly ScopeId[]>

export type FeatureId = keyof typeof FEATURES
