export type Channel<ChannelType = unknown, OpeningData = unknown> = {
  channelId: string
  channelName: string
  channelObject?: ChannelType
  openingData?: OpeningData
}

export abstract class ChannelStore<
  ChannelType = unknown,
  OpeningData = unknown,
  TypedChannel = Channel<ChannelType, OpeningData>,
> {
  public abstract addChannel(
    channel: Channel<ChannelType, OpeningData>
  ): Promise<void> | void
  public abstract removeChannels(channelId: string[]): Promise<void> | void
  public abstract setPikkuUserId(
    channelId: string,
    pikkuUserId: string | null
  ): Promise<void> | void
  public abstract getChannel(
    channelId: string
  ):
    | Promise<TypedChannel & { pikkuUserId?: string }>
    | (TypedChannel & { pikkuUserId?: string })

  /**
   * Persist per-socket scratch state scoped to a single channel (keyed by
   * channelId). This is intentionally separate from `SessionStore` (which is
   * keyed by `pikkuUserId` and holds the user session — shared across HTTP
   * and channel transports).
   *
   * Use this for ephemeral, channel-local data: a per-socket subscription
   * filter, a step in a connection-bound state machine, the last command sent
   * on this socket, etc. It is cleared when the channel is removed.
   */
  public abstract setState(
    channelId: string,
    state: unknown
  ): Promise<void> | void
  public abstract getState(
    channelId: string
  ): Promise<unknown | undefined> | unknown | undefined
  public abstract clearState(channelId: string): Promise<void> | void
}
