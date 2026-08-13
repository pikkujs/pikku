export interface SessionStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  delete(key: string): Promise<void>
}

export interface InMemorySessionStore extends SessionStore {
  size(): number
  clear(): void
}

export const inMemorySessionStore = (
  now: () => number = Date.now
): InMemorySessionStore => {
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

  return {
    async get(key) {
      return live(key)?.value ?? null
    },
    async set(key, value, ttlSeconds) {
      entries.set(key, {
        value,
        expiresAt:
          ttlSeconds === undefined ? null : now() + Math.max(0, ttlSeconds) * 1000,
      })
    },
    async delete(key) {
      entries.delete(key)
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

export const prefixedSessionStore = (
  store: SessionStore,
  prefix: string
): SessionStore => ({
  get: (key) => store.get(`${prefix}${key}`),
  set: (key, value, ttlSeconds) =>
    store.set(`${prefix}${key}`, value, ttlSeconds),
  delete: (key) => store.delete(`${prefix}${key}`),
})
