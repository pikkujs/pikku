import { ChannelStore } from '../channel/channel-store.js'
import { CoreUserSession } from '../types/core.types.js'

export interface UserSessionService<UserSession extends CoreUserSession> {
  set(session: UserSession): Promise<void> | void
  clear(): Promise<void> | void
  get(): Promise<UserSession | undefined> | UserSession | undefined
}

export class LocalUserSessionService<UserSession extends CoreUserSession>
  implements UserSessionService<UserSession>
{
  constructor(private session: UserSession | undefined = undefined) {}

  public set(session: UserSession) {
    this.session = session
  }

  public clear() {
    this.session = undefined
  }

  public get(): UserSession | undefined {
    return this.session
  }
}

export class RemoteUserSessionService<UserSession extends CoreUserSession>
  implements UserSessionService<UserSession>
{
  constructor(
    private channelStore: ChannelStore<unknown, unknown, UserSession>,
    private channelId: string,
    public session: UserSession | undefined = undefined
  ) {}

  public set(session: UserSession) {
    return this.channelStore.setUserSession(this.channelId, session)
  }

  public clear() {
    return this.channelStore.setUserSession(this.channelId, null)
  }

  public async get(): Promise<UserSession | undefined> {
    const { session } = await this.channelStore.getChannelAndSession(
      this.channelId
    )
    return session
  }
}
