export interface CreateFeatureFlagsOptions<Name extends string> {
  /** The read endpoint, or a getter for it when the API URL is resolved lazily. */
  endpoint: string | (() => string)
  /**
   * The map a server-rendered page already computed, embedded so the first
   * paint is correct.
   *
   * Without it there is a gap between mount and the response in which neither
   * default is right: false hides a feature the user has, true flashes one they
   * do not. The fetch still runs and confirms — this only decides what is on
   * screen while it does.
   */
  bootstrap?: Partial<Record<Name, boolean>>
  /**
   * What an unknown flag resolves to before the first response lands, and if
   * the request fails.
   *
   * Defaults to false. A flag is an off switch — failing closed hides a feature
   * that is probably there, while failing open shows one that may be dark to
   * everyone else. The server gate is unchanged either way: a client that
   * renders the button anyway gets a 503 rather than the feature.
   */
  fallback?: boolean
}

export interface FeatureFlagClient<Name extends string> {
  /** Whether to render. Synchronous — the map is in memory. */
  has(name: Name): boolean
  all(): Partial<Record<Name, boolean>>
  /** False until the first response lands, so a caller can hold a render back. */
  ready: boolean
  /**
   * Re-reads the map. Call it when the session changes: `capable` comes from
   * the session's scopes, so signing in or out moves flags that availability
   * alone would not.
   */
  refresh(): Promise<void>
  subscribe(listener: () => void): () => void
}

/**
 * The caller's feature flags, fetched once and read from memory after.
 *
 * One request per session rather than one per flag: a flag is checked wherever
 * a component renders, and a request from each would put the network in front
 * of a paint.
 *
 * Advisory, always. The map is what to show, never what is allowed — the runner
 * re-checks availability on every call, and authorization was never a flag's
 * job. A client that ignores this and calls anyway gets a 503, not the feature.
 */
export function createFeatureFlags<Name extends string>({
  endpoint,
  bootstrap,
  fallback = false,
}: CreateFeatureFlagsOptions<Name>): FeatureFlagClient<Name> {
  let flags: Partial<Record<Name, boolean>> = { ...bootstrap }
  let ready = false
  let inflight: Promise<void> | undefined
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const url = () => (typeof endpoint === 'function' ? endpoint() : endpoint)

  const refresh = (): Promise<void> => {
    // Deduped rather than queued: several components mounting at once is the
    // normal case, and they all want the same answer.
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const response = await fetch(url(), { credentials: 'include' })
        if (!response.ok) return
        flags = (await response.json()) as Partial<Record<Name, boolean>>
      } catch {
        // Keep whatever is already on screen. A blip must not relabel every
        // flag mid-session, which is what replacing the map with {} would do.
      } finally {
        ready = true
        inflight = undefined
        emit()
      }
    })()
    return inflight
  }

  return {
    has: (name) => flags[name] ?? fallback,
    all: () => flags,
    get ready() {
      return ready
    },
    refresh,
    subscribe: (listener) => {
      // The first subscriber starts the fetch, so a page that renders no
      // flagged component never makes the request at all.
      if (!ready && !inflight) void refresh()
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
