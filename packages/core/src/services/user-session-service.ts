import { ChannelStore } from '../wirings/channel/channel-store.js'
import { CoreUserSession } from '../types/core.types.js'

export interface SessionService<UserSession extends CoreUserSession> {
  sessionChanged: boolean
  initial: UserSession | undefined
  setInitial(session: UserSession): void
  freezeInitial(): UserSession | undefined
  set(session: UserSession): Promise<void> | void
  clear(): Promise<void> | void
  get(): Promise<UserSession> | UserSession | undefined
}

export class PikkuSessionService<UserSession extends CoreUserSession>
  implements SessionService<UserSession>
{
  public sessionChanged = false
  public initial: UserSession | undefined
  private session: UserSession | undefined
  constructor(
    private channelStore?: ChannelStore<unknown, unknown, UserSession>,
    private channelId?: string
  ) {
    if (channelStore && !channelId) {
      throw new Error('Channel ID is required when using channel store')
    }
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

  public set(session: UserSession) {
    this.sessionChanged = true
    this.session = session
    return this.channelStore?.setUserSession(this.channelId!, session)
  }

  public clear() {
    this.sessionChanged = true
    this.session = undefined
    return this.channelStore?.setUserSession(this.channelId!, null)
  }

  public get(): Promise<UserSession> | UserSession | undefined {
    if (this.channelStore) {
      const channel = this.channelStore.getChannelAndSession(this.channelId!)
      if (channel instanceof Promise) {
        return channel.then(({ session }) => session)
      } else {
        return channel.session
      }
    }
    return this.session
  }
}

export function createMiddlewareSessionWireProps<
  UserSession extends CoreUserSession,
>(session: SessionService<UserSession>) {
  return {
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
