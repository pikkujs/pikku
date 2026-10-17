/** A channel as a {@link ChannelStore} persists it between serverless invocations. */
export type Channel<ChannelType = unknown, OpeningData = unknown> = {
  channelId: string
  channelName: string
  channelObject?: ChannelType
  openingData?: OpeningData
}

/**
 * Persists open channels for serverless runtimes, where each connect, message and disconnect runs in a separate invocation.
 *
 * It keeps the channel's opening data, its state, and the `pikkuUserId` of the
 * session established on connect. The session itself is not stored: each
 * message reloads it from the `sessionStore` by that id.
 */
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

  public abstract setState(
    channelId: string,
    state: unknown
  ): Promise<void> | void
  public abstract getState(
    channelId: string
  ): Promise<unknown | undefined> | unknown | undefined
  public abstract clearState(channelId: string): Promise<void> | void
}
