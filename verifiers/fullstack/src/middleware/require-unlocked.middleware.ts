import { addTagMiddleware, requireUnlocked } from '@pikku/core/middleware'
import { dataLock } from '../data-lock.js'

/**
 * Refuses the note wirings with 423 while the store is shut.
 *
 * Scoped by tag rather than globally so the lock routes and the static
 * frontend stay reachable — the screen that types the passphrase has to be
 * servable by a server that has not been given it yet.
 */
export const requireUnlockedNotes = () =>
  addTagMiddleware('notes', [requireUnlocked(dataLock)])
