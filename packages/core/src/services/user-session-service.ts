import type { CoreUserSession } from '../types/core.types.js'
import type { SessionStore } from './session-store.js'

export interface SessionService<UserSession extends CoreUserSession> {
  sessionChanged: boolean
  initial: UserSession | undefined
  setInitial(session: UserSession): void
  freezeInitial(): UserSession | undefined
  set(session: UserSession): Promise<void> | void
  clear(): Promise<void> | void
  get(): UserSession | undefined
}

export class PikkuSessionService<UserSession extends CoreUserSession>
  implements SessionService<UserSession>
{
  public sessionChanged = false
  public initial: UserSession | undefined
  private session: UserSession | undefined
  private pikkuUserId?: string

  constructor(private sessionStore?: SessionStore<UserSession>) {}

  public setPikkuUserId(id: string) {
    this.pikkuUserId = id
  }

  public getPikkuUserId(): string | undefined {
    return this.pikkuUserId
  }

  public setInitial(session: UserSession) {
    this.session = session
  }

  public freezeInitial() {
    if (this.initial === undefined) {
      this.initial = this.session
    }
    return this.initial
  }

  public async set(session: UserSession) {
    this.sessionChanged = true
    this.session = session
    if (this.sessionStore && this.pikkuUserId) {
      await this.sessionStore.set(this.pikkuUserId, session)
    }
  }

  public async clear() {
    this.sessionChanged = true
    this.session = undefined
    if (this.sessionStore && this.pikkuUserId) {
      await this.sessionStore.clear(this.pikkuUserId)
    }
  }

  public get(): UserSession | undefined {
    return this.session
  }
}

export function createMiddlewareSessionWireProps<
  UserSession extends CoreUserSession,
>(session: SessionService<UserSession>) {
  return {
    session: session.get() as UserSession | undefined,
    setSession: (s: UserSession) => session.setInitial(s),
    getSession: () => session.get(),
    hasSessionChanged: () => session.sessionChanged,
  }
}

export function createFunctionSessionWireProps<
  UserSession extends CoreUserSession,
>(session: SessionService<UserSession>) {
  return {
    session: session.freezeInitial(),
    setSession: (s: UserSession) => session.set(s),
    clearSession: () => session.clear(),
    getSession: () => session.get(),
    hasSessionChanged: () => session.sessionChanged,
  }
}
