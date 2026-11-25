import { frozenView } from './frozen-view.js'
import { ProviderError } from './provider-error.js'
import type { ProviderRegistry } from './provider-registry.js'
import { checkProvided, describeError } from './run-providers.js'
import type {
  ProviderProfile,
  ProviderTarget,
  ResolvedProvider,
  WireProviderFactory,
  WireProviderRun,
  WireProviderRunOptions,
} from './provider.types.js'
import type { PikkuWire } from '../types/core.types.js'

interface StopLogger {
  error(message: unknown, ...meta: unknown[]): void
}

/**
 * The per-request providers of one target, resolved once. Each invocation
 * builds the ones its function reaches, in dependency order, and stops them in
 * reverse when it ends.
 */
export class WireProviders {
  private resolved: ResolvedProvider[] | undefined
  private readonly reaches = new Map<string, ResolvedProvider[]>()

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly options: {
      target: ProviderTarget
      profile?: ProviderProfile
      /** Names the build in errors. Defaults to the target. */
      where?: string
    }
  ) {}

  /** Every provider, in the order a request builds them. */
  get order(): string[] {
    return this.all().map((provider) => provider.name)
  }

  private all(): ResolvedProvider[] {
    this.resolved ??= this.registry.resolve(this.options.target, {
      profile: this.options.profile,
      where: this.options.where,
      openNeeds: true,
    })
    return this.resolved
  }

  /**
   * The providers that provide one of `needs`, or a key those providers need.
   * Every provider when `needs` is not given.
   */
  private reached(needs: readonly string[] | undefined): ResolvedProvider[] {
    const all = this.all()
    if (!needs) return all
    const cacheKey = [...needs].sort().join(',')
    const cached = this.reaches.get(cacheKey)
    if (cached) return cached
    const wanted = new Set(needs)
    const picked = new Set<ResolvedProvider>()
    for (let index = all.length - 1; index >= 0; index--) {
      const provider = all[index]!
      if (!provider.provides.some((key) => wanted.has(key))) continue
      picked.add(provider)
      for (const need of provider.needs) wanted.add(need)
    }
    const reached = all.filter((provider) => picked.has(provider))
    this.reaches.set(cacheKey, reached)
    return reached
  }

  /**
   * Builds the providers `needs` reaches for one invocation. A provider's
   * factory receives a frozen view of the singleton services, the keys `held`
   * by the runner (core's `auditLog`) and the wire keys built before it, limited
   * to what it declares it needs, and the invocation's `wire` unchanged.
   *
   * A provider that throws stops the ones already built and fails with
   * `factory-failed`.
   */
  async run(
    singletons: object,
    wire: PikkuWire,
    options: WireProviderRunOptions = {}
  ): Promise<WireProviderRun> {
    const scope: Record<string, unknown> = Object.assign(
      Object.create(singletons),
      options.held
    )
    const services: Record<string, unknown> = {}
    const built: ResolvedProvider[] = []
    const stop = () => stopProviders(built, services, singletons)
    for (const provider of this.reached(options.needs)) {
      try {
        const view = frozenView(
          scope,
          [...new Set([...provider.needs, ...provider.optional])],
          provider.name
        )
        const factory = provider.factory as unknown as WireProviderFactory
        const provided = checkProvided(provider, await factory(view, wire))
        Object.assign(scope, provided)
        Object.assign(services, provided)
        built.push(provider)
      } catch (error) {
        await stop()
        if (error instanceof ProviderError) throw error
        throw new ProviderError(
          'factory-failed',
          `Provider '${provider.name}' failed to build: ${describeError(error)}`,
          { cause: error }
        )
      }
    }
    return { services, stop }
  }
}

const stopProviders = async (
  built: readonly ResolvedProvider[],
  services: Record<string, unknown>,
  singletons: object
): Promise<void> => {
  const logger = (singletons as { logger?: StopLogger }).logger
  const stopped = new Set<unknown>()
  for (const provider of [...built].reverse()) {
    for (const key of [...provider.provides].reverse()) {
      const value = services[key] as { stop?: () => unknown } | undefined
      if (value === null || typeof value !== 'object' || stopped.has(value)) {
        continue
      }
      stopped.add(value)
      if (typeof value.stop !== 'function') continue
      try {
        await value.stop()
      } catch (error) {
        logger?.error(error)
      }
    }
  }
}
