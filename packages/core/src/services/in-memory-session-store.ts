import type { CoreUserSession } from '../types/core.types.js'
import type { SessionStore } from './session-store.js'

export class InMemorySessionStore<
  UserSession extends CoreUserSession = CoreUserSession,
> implements SessionStore<UserSession>
{
  private sessions = new Map<string, UserSession>()

  async get(pikkuUserId: string): Promise<UserSession | undefined> {
    return this.sessions.get(pikkuUserId)
  }

  async set(pikkuUserId: string, session: UserSession): Promise<void> {
    this.sessions.set(pikkuUserId, session)
  }

  async clear(pikkuUserId: string): Promise<void> {
    this.sessions.delete(pikkuUserId)
  }
}
