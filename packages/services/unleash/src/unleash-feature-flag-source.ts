import type { DeclaredFlag, FlagConfigSnapshot } from '@pikku/core/flag'
import { CachedFlagSource } from '@pikku/core/flag'
import type { CachedFlagSourceOptions } from '@pikku/core/flag'

export interface UnleashFeatureFlagSourceOptions extends CachedFlagSourceOptions {
  /** The Unleash API origin, e.g. `https://unleash.example.com`. */
  url: string
  /** A client API token. Never an admin token: this only ever reads. */
  token: string
  /** The application name Unleash records the fetch against. */
  appName?: string
  /** Unleash feature name for a pikku flag name, where the two differ. */
  keyMap?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

interface UnleashStrategy {
  name: string
  parameters?: Record<string, string | undefined>
  constraints?: unknown[]
}

interface UnleashFeature {
  name: string
  enabled: boolean
  strategies?: UnleashStrategy[]
}

const percentOf = (value: string | undefined): number | null => {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : null
}

const idsOf = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)

/**
 * Unleash as a read-only flag source.
 *
 * The second provider, and it is here to prove the seam rather than to be the
 * obvious choice: Unleash describes a flag as an ordered list of *strategies*
 * where PostHog describes it as filter groups, so the two payloads share almost
 * nothing. That both collapse into the same `FlagConfig` — a switch, a
 * percentage and a set of per-subject short-circuits — is the evidence that
 * `FeatureFlagSource` is the right width. If a third provider needed a fourth
 * field, this model would be wrong.
 *
 * Read through the client API with `fetch`, not `unleash-client`, for the same
 * reason PostHog is: the SDK polls on a timer belonging to a long-lived
 * process.
 *
 * What Unleash can express and this does NOT map: constraints, segments,
 * variants, and stickiness other than the default. `gradualRolloutUserId` and
 * `gradualRolloutSessionId` are read as percentages, but their bucketing is
 * Unleash's own — pikku rehashes the subject with its own salt, so a subject
 * near the boundary can fall on the other side of it than Unleash's UI says.
 * A percentage is the one part of this model that is approximate across
 * providers; the switch and the overrides are exact.
 */
export class UnleashFeatureFlagSource extends CachedFlagSource {
  private readonly url: string
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(private readonly options: UnleashFeatureFlagSourceOptions) {
    super(options)
    this.url = options.url.replace(/\/+$/, '')
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  /** Lets a project's declared set seed the cold-start fallback after construction. */
  public declare(flags: DeclaredFlag[]): void {
    this.setDeclared(flags)
  }

  protected async fetchSnapshot(): Promise<FlagConfigSnapshot> {
    const response = await this.fetchImpl(`${this.url}/api/client/features`, {
      headers: {
        Authorization: this.options.token,
        'UNLEASH-APPNAME': this.options.appName ?? 'pikku',
      },
    })
    if (!response.ok) {
      throw new Error(
        `Unleash returned ${response.status} for /api/client/features. A 401 here ` +
          `is usually an admin token where a client token belongs.`
      )
    }

    const body = (await response.json()) as { features?: UnleashFeature[] }
    const inverse = this.options.keyMap
      ? new Map(
          Object.entries(this.options.keyMap).map(([name, key]) => [key, name])
        )
      : undefined

    const snapshot: FlagConfigSnapshot = {}
    for (const feature of body.features ?? []) {
      const name = inverse?.get(feature.name) ?? feature.name
      snapshot[name] = this.toConfig(feature)
    }
    return snapshot
  }

  private toConfig(feature: UnleashFeature) {
    const overrides: Record<string, boolean> = {}
    let rolloutPercent: number | null = null
    const strategies = feature.strategies ?? []

    for (const strategy of strategies) {
      switch (strategy.name) {
        case 'default':
          // "On for everyone." Explicitly no constraint, which is null rather
          // than 100: null says the percentage is not part of this flag's
          // story, where 100 says a rollout finished and could be wound back.
          rolloutPercent = null
          break

        case 'flexibleRollout':
        case 'gradualRolloutUserId':
        case 'gradualRolloutSessionId':
        case 'gradualRolloutRandom': {
          const percent =
            percentOf(strategy.parameters?.rollout) ??
            percentOf(strategy.parameters?.percentage)
          if (percent !== null) {
            // Strategies OR together in Unleash, so the widest one decides.
            rolloutPercent = Math.max(rolloutPercent ?? 0, percent)
          }
          break
        }

        case 'userWithId':
          for (const id of idsOf(strategy.parameters?.userIds)) {
            overrides[id] = true
          }
          break

        default:
          // An unmapped strategy is left out rather than guessed at. It can only
          // widen access in Unleash — strategies OR — so ignoring it is the
          // conservative direction, and the flag still answers to its switch.
          break
      }
    }

    // A feature with no strategies at all is on when its toggle is on: Unleash
    // treats an empty strategy list as unconditional.
    return { enabled: feature.enabled, rolloutPercent, overrides }
  }
}
