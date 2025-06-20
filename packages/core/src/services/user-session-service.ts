import { ChannelStore } from '../events/channel/channel-store.js'
import { CoreUserSession } from '../types/core.types.js'

export interface UserSessionService<UserSession extends CoreUserSession> {
  sessionChanged: boolean
  setInitial(session: UserSession): void
  set(session: UserSession): Promise<void> | void
  clear(): Promise<void> | void
  get(): Promise<UserSession | undefined> | UserSession | undefined
}

export class PikkuUserSessionService<UserSession extends CoreUserSession>
  implements UserSessionService<UserSession>
{
  public sessionChanged = false
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
