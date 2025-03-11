import { CoreUserSession } from '../types/core.types.js'

export type Channel<ChannelType = unknown, OpeningData = unknown> = {
  channelId: string
  channelName: string
  channelObject?: ChannelType
  openingData?: OpeningData
}

export abstract class ChannelStore<
  ChannelType = unknown,
  OpeningData = unknown,
  UserSession extends CoreUserSession = CoreUserSession,
  TypedChannel = Channel<ChannelType, OpeningData>,
> {
  public abstract addChannel(
    channel: Channel<ChannelType, OpeningData>
  ): Promise<void> | void
  public abstract removeChannels(channelId: string[]): Promise<void> | void
  public abstract setUserSession(
    channelId: string,
    userSession: UserSession | null
  ): Promise<void> | void
  public abstract getChannelAndSession(
    channelId: string
  ):
    | Promise<TypedChannel & { session: UserSession }>
    | (TypedChannel & { session: UserSession })
}
