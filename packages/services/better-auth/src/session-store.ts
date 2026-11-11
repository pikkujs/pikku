/**
 * Storage for better-auth's `secondaryStorage`: the same contract, so one value
 * can be handed to `betterAuth({ secondaryStorage })` and to
 * `betterAuthStoreSession({ store })`.
 *
 * Unrelated to `@pikku/core`'s `SessionStore`, which persists pikku sessions by
 * user id; this one holds better-auth's own session rows by token.
 *
 * @example snippet: betterAuthStoreSession
 */
export interface AuthSessionStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  delete(key: string): Promise<void>
  /** Atomically read and remove `key`; better-auth uses it for one-time values. */
  getAndDelete(key: string): Promise<string | null>
  /**
   * Atomically add one to the counter at `key` and return the new value. An
   * absent key starts at `1` and expires `ttlSeconds` later; later increments
   * never extend it. better-auth's rate limiter relies on this.
   */
  increment(key: string, ttlSeconds: number): Promise<number>
}

/** An {@link AuthSessionStorage} held in process memory, for tests and single-instance dev. */
export interface InMemoryAuthSessionStorage extends AuthSessionStorage {
  size(): number
  clear(): void
}

/**
 * An {@link AuthSessionStorage} in process memory. Entries honour their TTL
 * against `now`, which tests replace to move time.
 *
 * @example snippet: betterAuthStoreSession
 */
export const inMemorySessionStore = (
  now: () => number = Date.now
): InMemoryAuthSessionStorage => {
  const entries = new Map<string, { value: string; expiresAt: number | null }>()

  const live = (key: string) => {
    const entry = entries.get(key)
    if (!entry) {
      return null
    }
    if (entry.expiresAt !== null && entry.expiresAt <= now()) {
      entries.delete(key)
      return null
    }
    return entry
  }

  const expiryFor = (ttlSeconds: number | undefined) =>
    ttlSeconds === undefined ? null : now() + Math.max(0, ttlSeconds) * 1000

  return {
    async get(key) {
      return live(key)?.value ?? null
    },
    async set(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAt: expiryFor(ttlSeconds) })
    },
    async delete(key) {
      entries.delete(key)
    },
    async getAndDelete(key) {
      const value = live(key)?.value ?? null
      entries.delete(key)
      return value
    },
    async increment(key, ttlSeconds) {
      const entry = live(key)
      const count = (entry ? Number(entry.value) || 0 : 0) + 1
      entries.set(key, {
        value: String(count),
        expiresAt: entry ? entry.expiresAt : expiryFor(ttlSeconds),
      })
      return count
    },
    size() {
      for (const key of [...entries.keys()]) {
        live(key)
      }
      return entries.size
    },
    clear() {
      entries.clear()
    },
  }
}

/**
 * Namespaces every key of `store` under `prefix`, so several apps can share one
 * backing store.
 *
 * @example snippet: betterAuthStoreSession
 */
export const prefixedSessionStore = (
  store: AuthSessionStorage,
  prefix: string
): AuthSessionStorage => ({
  get: (key) => store.get(`${prefix}${key}`),
  set: (key, value, ttlSeconds) =>
    store.set(`${prefix}${key}`, value, ttlSeconds),
  delete: (key) => store.delete(`${prefix}${key}`),
  getAndDelete: (key) => store.getAndDelete(`${prefix}${key}`),
  increment: (key, ttlSeconds) =>
    store.increment(`${prefix}${key}`, ttlSeconds),
})
