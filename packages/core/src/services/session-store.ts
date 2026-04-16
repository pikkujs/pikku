import type { CoreUserSession } from '../types/core.types.js'

export interface SessionStore<
  UserSession extends CoreUserSession = CoreUserSession,
> {
  get(pikkuUserId: string): Promise<UserSession | undefined>
  set(pikkuUserId: string, session: UserSession): Promise<void>
  clear(pikkuUserId: string): Promise<void>
}
