import type { CoreUserSession } from '../types/core.types.js'

/**
 * Keeps sessions server-side, keyed by pikku user id. When provided as the
 * `sessionStore` singleton service, a request without a session gets the stored
 * one, and `setSession`/`clearSession` write through to it.
 */
export interface SessionStore<
  UserSession extends CoreUserSession = CoreUserSession,
> {
  get(pikkuUserId: string): Promise<UserSession | undefined>
  set(pikkuUserId: string, session: UserSession): Promise<void>
  clear(pikkuUserId: string): Promise<void>
}
