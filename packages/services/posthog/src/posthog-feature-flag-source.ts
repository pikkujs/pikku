import type { DeclaredFlag, FlagConfigSnapshot } from '@pikku/core/flag'
import { CachedFlagSource } from '@pikku/core/flag'
import type { CachedFlagSourceOptions } from '@pikku/core/flag'

export interface PostHogFeatureFlagSourceOptions extends CachedFlagSourceOptions {
  /** The project API key, the one the browser SDK also uses. */
  projectApiKey: string
  /**
   * A personal API key with `feature_flag:read`. Local evaluation is the only
   * PostHog endpoint that hands over the whole flag definition rather than
   * answering one question about one user, and it is the only one that can back
   * a snapshot — so this key is required, and it is not the project key.
   */
  personalApiKey: string
  /** `https://eu.posthog.com` for EU projects, or a self-hosted origin. */
  host?: string
  /**
   * The PostHog group type that carries the organization, as configured in
   * group analytics. Overrides are read from filters on this group's key.
   */
  groupType?: string
  /** PostHog flag key for a pikku flag name, where the two differ. */
  keyMap?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

/** The subset of PostHog's local-evaluation payload this maps. */
interface PostHogProperty {
  key: string
  operator?: string
  value: unknown
  type?: string
  group_type_index?: number
}

interface PostHogGroup {
  properties?: PostHogProperty[]
  rollout_percentage?: number | null
  variant?: string | null
}

interface PostHogFlag {
  key: string
  active: boolean
  deleted?: boolean
  filters?: {
    groups?: PostHogGroup[]
    aggregation_group_type_index?: number
  }
}

const asIds = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string')
  }
  return []
}

/**
 * PostHog as a read-only flag source.
 *
 * A `FeatureFlagSource` and deliberately not a `FeatureFlagStore`: PostHog's
 * own UI is the operator surface, and writing flags back through its management
 * API would leave two systems owning one row. The console's Flags tab is
 * read-only against this, which is honest rather than a page of buttons that
 * 500.
 *
 * Implemented against the local-evaluation REST endpoint with `fetch` rather
 * than `posthog-node`. The SDK is built around a long-lived process with a
 * background poll timer, which a serverless isolate is not allowed to keep
 * between requests — so it would either never refresh or leak one timer per
 * isolate. A plain GET behind {@link CachedFlagSource} works in a Worker and in
 * a server, with the same code.
 *
 * What PostHog can express and this does NOT map: cohort membership, property
 * filters other than an exact match on the subject key, multivariate payloads
 * and variants, and `super_groups`. A flag using them resolves on its switch
 * and its catch-all rollout alone, which is more permissive than PostHog would
 * be for some subjects — so a flag whose targeting is a cohort is one to keep
 * in PostHog's own SDK on the client, not to gate a function with.
 */
export class PostHogFeatureFlagSource extends CachedFlagSource {
  private readonly host: string
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(private readonly options: PostHogFeatureFlagSourceOptions) {
    super(options)
    this.host = (options.host ?? 'https://app.posthog.com').replace(/\/+$/, '')
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  /** Lets a project's declared set seed the cold-start fallback after construction. */
  public declare(flags: DeclaredFlag[]): void {
    this.setDeclared(flags)
  }

  protected async fetchSnapshot(): Promise<FlagConfigSnapshot> {
    const url = `${this.host}/api/feature_flag/local_evaluation?token=${encodeURIComponent(
      this.options.projectApiKey
    )}&send_cohorts=false`

    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${this.options.personalApiKey}` },
    })
    if (!response.ok) {
      throw new Error(
        `PostHog local evaluation returned ${response.status}. A 401 here is the ` +
          `personal API key (it needs feature_flag:read); a 402 is the plan.`
      )
    }

    const body = (await response.json()) as { flags?: PostHogFlag[] }
    const byKey = new Map<string, PostHogFlag>()
    for (const flag of body.flags ?? []) {
      if (!flag.deleted) {
        byKey.set(flag.key, flag)
      }
    }

    const snapshot: FlagConfigSnapshot = {}
    for (const [name, flag] of this.resolveKeys(byKey)) {
      snapshot[name] = this.toConfig(flag)
    }
    return snapshot
  }

  /**
   * Keys the snapshot by pikku flag name, not PostHog key.
   *
   * Without `keyMap` the two are the same string, which is the case worth
   * making easy: a flag whose name differs between the two systems is a flag
   * nobody can reason about during an incident.
   */
  private resolveKeys(
    byKey: Map<string, PostHogFlag>
  ): Array<[string, PostHogFlag]> {
    const map = this.options.keyMap
    if (!map) {
      return [...byKey].map(([key, flag]) => [key, flag])
    }
    const inverse = new Map(
      Object.entries(map).map(([name, key]) => [key, name])
    )
    return [...byKey].map(([key, flag]) => [inverse.get(key) ?? key, flag])
  }

  private toConfig(flag: PostHogFlag) {
    const groups = flag.filters?.groups ?? []
    const overrides: Record<string, boolean> = {}
    let rolloutPercent: number | null = null

    for (const group of groups) {
      const properties = group.properties ?? []
      const percent = group.rollout_percentage ?? 100

      if (properties.length === 0) {
        // The catch-all release condition. PostHog treats a condition with no
        // properties as "everyone, at this percentage", which is exactly a
        // rollout. The highest such condition wins: PostHog matches a subject
        // against every group and any match releases them.
        rolloutPercent = Math.max(rolloutPercent ?? 0, percent)
        continue
      }

      // A single exact-match condition on the subject key is the shape of a
      // targeted release — "these three organizations" — and is the one
      // property filter that maps cleanly onto an override. Anything else is
      // left alone rather than approximated: a guessed match is worse than a
      // documented gap, because it is a gate someone believes in.
      if (properties.length !== 1) {
        continue
      }
      const property = properties[0]!
      if (!this.isSubjectKey(property, flag) || !this.isExact(property)) {
        continue
      }
      for (const id of asIds(property.value)) {
        overrides[id] = percent >= 100
      }
    }

    return { enabled: flag.active, rolloutPercent, overrides }
  }

  private isExact(property: PostHogProperty): boolean {
    return property.operator === undefined || property.operator === 'exact'
  }

  /**
   * Whether this property names the subject a pikku override is keyed on.
   *
   * A group-aggregated flag carries the group key; a person-aggregated one
   * carries `distinct_id`. Both resolve to the same opaque string on the pikku
   * side, because by the time a subject reaches the resolver the organization
   * and the user are one id.
   */
  private isSubjectKey(property: PostHogProperty, flag: PostHogFlag): boolean {
    const groupType = this.options.groupType
    if (flag.filters?.aggregation_group_type_index !== undefined) {
      return property.key === '$group_key' || property.key === groupType
    }
    return property.key === 'distinct_id' || property.key === '$user_id'
  }
}
