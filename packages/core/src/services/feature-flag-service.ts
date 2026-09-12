import type {
  DeclaredFlag,
  FlagConfigSnapshot,
  FlagSubject,
} from '../wirings/flag/flag.types.js'

/**
 * The read half of feature flags, and the only half on the request path.
 *
 * Split from {@link FeatureFlagStore} so a third-party provider — PostHog,
 * Unleash, LaunchDarkly — can back flags without pretending to implement an
 * administration surface it does not own. Their UI is the operator surface;
 * writing flags back through their management API means two systems own the
 * same rows, and an implementation that throws from six methods is a console
 * full of buttons that 500.
 */
export interface FeatureFlagSource {
  /**
   * The global config half: one small blob shared by every user, never
   * per-user data.
   *
   * Implementations MUST cache this in isolate memory and MUST fall back to the
   * compiled declaration when the backing store cannot be read — never to a
   * database query, which would put I/O on the request path this design exists
   * to keep clear. See `compiledFallbackSnapshot`.
   */
  snapshot(): Promise<FlagConfigSnapshot>
}

/** One flag as an administration surface sees it. */
export type FlagRow = DeclaredFlag & {
  enabled: boolean
  rolloutPercent: number | null
  /**
   * False when the flag's declaration has been removed from code but its row
   * survives: still switchable, no longer offered, awaiting `pikku flags
   * prune`. Never a silent revoke.
   */
  declared: boolean
}

/**
 * The write half: the declaration lifecycle plus the operator controls.
 *
 * Implemented by a store pikku owns. Absent when flags come from a provider,
 * which is what makes the console's Flags tab read-only rather than lying.
 */
export interface FeatureFlagStore extends FeatureFlagSource {
  /**
   * Registers the declared vocabulary. Additive on the same terms as
   * `syncScopes`: a removed declaration leaves the row marked `declared: false`
   * rather than deleting an operator's switch on deploy.
   *
   * A flag's description and `anyOf` *are* re-synced, because that is the
   * declaration's whole content — editing it is how you change what the flag
   * means, and the deploy is when it takes effect. `enabled`, the rollout and
   * every override are the operator's, and are never touched.
   */
  syncFlags(flags: DeclaredFlag[]): Promise<void>

  listFlags(): Promise<FlagRow[]>

  setEnabled(
    key: string,
    enabled: boolean,
    actor?: string,
    note?: string
  ): Promise<void>

  /** `percent` is 0–100, or null to remove the rollout constraint. */
  setRollout(key: string, percent: number | null, actor?: string): Promise<void>

  setOverride(
    key: string,
    subject: FlagSubject,
    enabled: boolean,
    actor?: string
  ): Promise<void>

  clearOverride(key: string, subject: FlagSubject): Promise<void>

  /** Flags in the store with no declaration left in code; powers `pikku flags audit`. */
  findStaleFlags(): Promise<string[]>

  /** Removes undeclared flags and their overrides. */
  pruneFlags(): Promise<string[]>
}
