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
   * Persist a session payload scoped to a single channel (keyed by channelId).
   *
   * This is intentionally separate from `SessionStore` (which keys by
   * `pikkuUserId`). Channels have their own identity and may be
   * unauthenticated, so user-keyed storage is the wrong scope. Implementations
   * should store the payload alongside the channel record itself, so it is
   * cleared when the channel is removed.
   */
  public abstract setSession(
    channelId: string,
    session: unknown
  ): Promise<void> | void
  public abstract getSession(
    channelId: string
  ): Promise<unknown | undefined> | unknown | undefined
  public abstract clearSession(channelId: string): Promise<void> | void
}
