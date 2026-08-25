import type { DataLock } from '../classification/data-lock.js'
import { DataLockedError } from '../errors/errors.js'
import { pikkuMiddleware } from './middleware-factories.js'

/**
 * Refuses a request while the encrypted store is locked.
 *
 * Applied by tag or route rather than globally, because the unlock endpoint and
 * the static frontend have to stay reachable — a store that gated its own
 * unlock screen could never be opened. Static mounts serve a file hit before
 * dispatch, so the app shell is already outside this gate; the unlock function
 * is the one wiring that must not carry it.
 *
 * The gate is deliberately in front of the function rather than inside the
 * query layer. Both refuse, but only this one refuses before the handler has
 * touched the database.
 */
export const requireUnlocked = (lock: DataLock) =>
  pikkuMiddleware(async (_services, _wires, next) => {
    if (lock.state !== 'unlocked') {
      throw new DataLockedError()
    }
    return next()
  })
