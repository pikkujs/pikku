import type { CoreUserSession } from '../types/core.types.js'
import type { ChannelStore } from '../wirings/channel/channel-store.js'
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

/**
 * Channel-scoped session service. Routes `set`/`clear` through `ChannelStore`
 * keyed by `channelId` instead of `SessionStore` keyed by `pikkuUserId`.
 *
 * Channels have their own identity and may be unauthenticated, so reusing the
 * user-keyed `SessionStore` is the wrong scope: anonymous channels can't have
 * a session at all, multiple anonymous tabs by the same user collide on
 * `sessionStore[pikkuUserId]`, and channel-scoped state pollutes the user
 * session store.
 *
 * Auth identity (`pikkuUserId`) is independent of channel session payload —
 * this service still inherits `setPikkuUserId`/`getPikkuUserId` from the base
 * class so connect-time auth middleware works unchanged.
 */
export class PikkuChannelSessionService<
  UserSession extends CoreUserSession,
> extends PikkuSessionService<UserSession> {
  constructor(
    private channelStore: ChannelStore,
    private channelId: string
  ) {
    super(undefined)
  }

  public override async set(session: UserSession): Promise<void> {
    this.sessionChanged = true
    this.session = session
    await this.channelStore.setSession(this.channelId, session)
  }

  public override async clear(): Promise<void> {
    this.sessionChanged = true
    this.session = undefined
    await this.channelStore.clearSession(this.channelId)
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
