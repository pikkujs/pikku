import { ChannelStore } from '../channel/channel-store.js'
import { CoreUserSession } from '../types/core.types.js'

export interface UserSessionService<UserSession extends CoreUserSession> {
  setSession(session: UserSession): Promise<void> | void
  deleteSession(): Promise<void> | void
  getSession(): Promise<UserSession | undefined> | UserSession | undefined
}

export class LocalUserSessionService<UserSession extends CoreUserSession> implements UserSessionService<UserSession> {
  constructor (public session: UserSession | undefined = undefined) {
  }

  public setSession (session: UserSession) {
    this.session = session
  }

  public deleteSession () {
    this.session = undefined
  }

  public getSession (): UserSession | undefined {
    return this.session
  }
}

export class RemoteUserSessionService<UserSession extends CoreUserSession> implements UserSessionService<UserSession> {
  constructor (
    private channelStore: ChannelStore<unknown, unknown, UserSession>, 
    private channelId: string,
    public session: UserSession | undefined = undefined
  ) {
  }

  public async setSession (session: UserSession) {
    await this.channelStore.setUserSession(this.channelId, session)
  }

  public async deleteSession () {
    await this.channelStore.setUserSession(this.channelId, undefined)
  }

  public async getSession (): Promise<UserSession | undefined> {
    const channel = await this.channelStore.getChannel(this.channelId)
    return channel.userSession
  }
}
