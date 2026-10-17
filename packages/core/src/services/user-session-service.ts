import type { CoreUserSession } from '../types/core.types.js'
import type { SessionStore } from './session-store.js'

/**
 * Tracks the session during one invocation. Middleware sets the initial
 * session; the function's view is frozen when it starts, and
 * `setSession`/`clearSession` mark it changed so the transport (for example a
 * cookie middleware) can write it back.
 */
export interface SessionService<UserSession extends CoreUserSession> {
  sessionChanged: boolean
  initial: UserSession | undefined
  setInitial(session: UserSession): void
  freezeInitial(): UserSession | undefined
  set(session: UserSession): Promise<void> | void
  clear(): Promise<void> | void
  get(): UserSession | undefined
}

/**
 * The default {@link SessionService}. Writes through to a {@link SessionStore}
 * when one is configured and the pikku user id is known.
 */
export class PikkuSessionService<
  UserSession extends CoreUserSession,
> implements SessionService<UserSession> {
  public sessionChanged = false
  public initial: UserSession | undefined
  protected session: UserSession | undefined
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
    // A session set before anyone was resolved — the usual case for
    // middleware or a login function signing someone in — is stored under its
    // own user rather than not at all.
    const userId = (session as { userId?: unknown } | undefined)?.userId
    if (this.pikkuUserId === undefined && typeof userId === 'string') {
      this.pikkuUserId = userId
    }
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

// knowledge: decisions/security/set-session-persists-and-set-initial-session-does-not.md
/**
 * The session accessors a transport puts on the wire before middleware runs.
 * `setSession` and `clearSession` mean the same here as in a function body:
 * they mark the session changed (so `authCookie` re-issues the cookie) and
 * write the session store. `setInitialSession` is the request-scoped one, for
 * middleware that establishes who the caller is from a credential it was
 * handed.
 * Runtime adapters that run middleware outside the HTTP runner (such as the
 * Next.js one) build it with this.
 */
export function createMiddlewareSessionWireProps<
  UserSession extends CoreUserSession,
>(session: SessionService<UserSession>) {
  return {
    session: session.get() as UserSession | undefined,
    ...createSessionAccessors(session),
  }
}

export function createFunctionSessionWireProps<
  UserSession extends CoreUserSession,
>(session: SessionService<UserSession>) {
  return {
    session: session.freezeInitial(),
    ...createSessionAccessors(session),
  }
}

export function createSessionAccessors<UserSession extends CoreUserSession>(
  session: SessionService<UserSession>
) {
  return {
    setSession: (s: UserSession) => session.set(s),
    setInitialSession: (s: UserSession) => session.setInitial(s),
    clearSession: () => session.clear(),
    getSession: () => session.get(),
    hasSessionChanged: () => session.sessionChanged,
  }
}
