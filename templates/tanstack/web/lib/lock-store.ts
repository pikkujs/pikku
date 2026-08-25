import { dataLock, type DataLockStatus } from './data-lock-client'

/**
 * The one place the app keeps what it believes the lock state to be.
 *
 * It is a store rather than per-route state because two very different things
 * write to it: the boot check that decides which screen to show, and any other
 * request that comes back 423 because the store shut underneath a page that
 * was already open.
 */
let current: DataLockStatus | null = null
let inFlight: Promise<DataLockStatus> | null = null

const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) {
    listener()
  }
}

const set = (status: DataLockStatus) => {
  current = status
  emit()
}

export const lockStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  snapshot(): DataLockStatus | null {
    return current
  },

  set,

  /** Ask the server, collapsing concurrent callers onto one request. */
  async refresh(): Promise<DataLockStatus> {
    inFlight ??= dataLock.status().finally(() => {
      inFlight = null
    })
    const status = await inFlight
    set(status)
    return status
  },

  /** The boot question: what state is this store in, asked at most once. */
  async ensure(): Promise<DataLockStatus> {
    return current ?? (await lockStore.refresh())
  },

  /**
   * A 423 came back from something that was not a lock route, so the store
   * closed under a page that was already open. Believe it immediately — the
   * app has to leave for the unlock screen rather than render a broken page —
   * and confirm with the server afterwards, since only it knows whether a
   * lockout window is also running.
   */
  markLocked(): void {
    set({ state: 'locked', retryAfterMs: current?.retryAfterMs ?? 0 })
    void lockStore.refresh().catch(() => undefined)
  },
}
