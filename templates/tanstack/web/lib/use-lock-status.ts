import { useSyncExternalStore } from 'react'
import { lockStore } from './lock-store'
import type { DataLockStatus } from './data-lock-client'

/** What the app currently believes about the lock, re-rendering when it moves. */
export const useLockStatus = (): DataLockStatus | null =>
  useSyncExternalStore(lockStore.subscribe, lockStore.snapshot, () => null)
