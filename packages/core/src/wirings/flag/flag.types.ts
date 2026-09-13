/**
 * A feature flag: a UI-facing name a client can ask about without knowing
 * anything about the capability vocabulary.
 *
 * The flag is the indirection that keeps scopes a server concern. Returning
 * `session.scopes` to the client would work and is wrong three times over: it
 * publishes the vocabulary to every screen, it makes a scope rename a frontend
 * refactor, and it forces each call site to reimplement parent-grant
 * resolution — which some will get wrong in the permissive direction.
 */
export type CoreFeatureFlag = {
  /** Surfaced in the console beside the switch. */
  description?: string
  /**
   * The session satisfies this flag by holding ANY of these — deliberately the
   * opposite of `scopes:`, which is AND, because a flag usually reveals one
   * entry point several roles can reach. Named `anyOf` and not `scopes` so the
   * inverted semantics are visible at the call site.
   *
   * Every id must be declared with `defineScope`; the inspector fails the
   * build otherwise, the same rule `defineSystemRole` already enforces.
   *
   * Omitted means no capability constraint — NOT "always on". The switch,
   * the rollout bucket and any override still apply, which is what makes a
   * flag usable as a pure kill switch. An explicit `anyOf: []` is a
   * declaration error: write no key, or write scopes.
   */
  anyOf?: string[]
}

/**
 * Feature flags to declare, keyed by name. A key must be non-empty and must
 * not contain `:` — that separator belongs to scopes, and a flag that looks
 * like a scope id invites exactly the confusion this exists to prevent.
 */
export type CoreFeatureFlags = Record<string, CoreFeatureFlag>

export type FeatureFlagDefinitionMeta = {
  name: string
  description?: string
  anyOf?: string[]
  sourceFile?: string
}

export type FeatureFlagDefinitions = FeatureFlagDefinitionMeta[]
export type FeatureFlagDefinitionsMeta = Record<
  string,
  FeatureFlagDefinitionMeta
>

/** A declared flag, ready to sync into a flag store. */
export type DeclaredFlag = {
  name: string
  description?: string
  anyOf?: string[]
}

/**
 * Who a rollout bucket and an override are keyed on.
 *
 * The organization is preferred over the user wherever both are known: two
 * colleagues on a screen-share seeing different UIs is a support ticket.
 */
export type FlagSubject = {
  organizationId?: string
  userId?: string
}

/** The runtime half of one flag: what an operator set, not what code declared. */
export type FlagConfig = {
  enabled: boolean
  /** 0–100, or null for no rollout constraint. */
  rolloutPercent: number | null
  /**
   * Per-subject short-circuits, keyed by subject id. The one genuine OR in the
   * model: "off for everyone, but these three orgs see it." An override wins
   * over both the switch and the bucket, in either direction, so QA can enter a
   * 5% rollout and a single tenant can be excluded from a bad one.
   */
  overrides: Record<string, boolean>
}

/**
 * The global config half, keyed by flag name. One small blob shared by every
 * user, which is why it is not baked into the session: writing it per-session
 * would make killing a feature an unbounded fan-out over every active session,
 * with users on both sides of the flip for its duration.
 */
export type FlagConfigSnapshot = Record<string, FlagConfig>

/**
 * A flag resolves to two booleans, not one. One bit cannot distinguish "you may
 * not" (a 403, the caller's own situation) from "nobody may right now" (a 503,
 * ours) — and collapsing them is what leaves a kill switch with nothing to
 * enforce.
 */
export type FlagState = {
  /** The feature is switched on at all. Global, caller-blind, and the only half
   *  the runner enforces. */
  available: boolean
  /** This session holds a satisfying scope. Advisory to the client; hides UI and
   *  protects nothing, forever. */
  capable: boolean
}

/** What a client renders on. */
export type ResolvedFlag = FlagState & { show: boolean }
