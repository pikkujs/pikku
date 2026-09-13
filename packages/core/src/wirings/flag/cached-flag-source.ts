import type { FeatureFlagSource } from '../../services/feature-flag-service.js'
import type { DeclaredFlag, FlagConfigSnapshot } from './flag.types.js'
import { compiledFallbackSnapshot } from './validate-flag-definitions.js'

export interface CachedFlagSourceOptions {
  /**
   * How long a snapshot is served before it is refreshed, in milliseconds.
   *
   * This is the latency of a kill switch, so it is short. It is not zero
   * because the alternative is a round trip on every call to every flagged
   * function, and a flag system that costs one is a flag system nobody puts on
   * a hot path — which is exactly where a kill switch earns its keep.
   */
  ttlMs?: number
  /**
   * The declared flags, used to build the cold-start fallback. Omitted leaves
   * the fallback empty, which resolves every flag as available: a flag absent
   * from a snapshot fails open.
   */
  declared?: readonly DeclaredFlag[]
}

const DEFAULT_TTL_MS = 30_000

/**
 * The caching every flag source needs, so no adapter has to get it right twice.
 *
 * Three layers, in descending order of truth: a fresh read, the last good read,
 * and the compiled declaration. The middle layer is the one that matters —
 * dropping straight to the compiled fallback on a blip would switch on every
 * flag an operator had deliberately left off, which is the opposite of what a
 * dark launch is for. The compiled fallback is reached only on a cold start
 * that has never managed a read, where there is nothing better to say.
 *
 * Refresh is pull-on-demand rather than a background poller on purpose. A
 * poller assumes a long-lived process; an isolate on a serverless runtime is
 * neither long-lived nor allowed to hold a timer between requests, so a vendor
 * SDK built around one either never refreshes or leaks. Fetching inside the
 * request that noticed the snapshot was stale works in both places.
 */
export abstract class CachedFlagSource implements FeatureFlagSource {
  private cached: FlagConfigSnapshot | undefined
  private cachedAt = 0
  private inflight: Promise<FlagConfigSnapshot> | undefined
  private fallback: FlagConfigSnapshot
  private declared: readonly DeclaredFlag[]
  private readonly ttlMs: number

  constructor(options: CachedFlagSourceOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.declared = options.declared ?? []
    this.fallback = compiledFallbackSnapshot(this.declared)
  }

  /** One read of the backing store. Never called concurrently with itself. */
  protected abstract fetchSnapshot(): Promise<FlagConfigSnapshot>

  /** Replaces the cold-start fallback, once the declared set is known. */
  protected setDeclared(declared: DeclaredFlag[]): void {
    this.declared = declared
    this.fallback = compiledFallbackSnapshot(declared)
  }

  declaredFlags(): readonly DeclaredFlag[] {
    return this.declared
  }

  /** Drops the cache, so the next read goes to the store. */
  protected invalidate(): void {
    this.cachedAt = 0
  }

  async snapshot(): Promise<FlagConfigSnapshot> {
    if (this.cached && Date.now() - this.cachedAt < this.ttlMs) {
      return this.cached
    }
    if (!this.inflight) {
      this.inflight = this.fetchSnapshot()
        .then((snapshot) => {
          this.cached = snapshot
          this.cachedAt = Date.now()
          return snapshot
        })
        .finally(() => {
          this.inflight = undefined
        })
    }
    try {
      return await this.inflight
    } catch {
      return this.cached ?? this.fallback
    }
  }
}
