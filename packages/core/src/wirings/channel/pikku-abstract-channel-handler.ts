import type { PikkuChannel, PikkuChannelHandler } from './channel.types.js'

export abstract class PikkuAbstractChannelHandler<
  OpeningData = unknown,
  Out = unknown,
> implements PikkuChannelHandler<OpeningData, Out>
{
  protected channel?: PikkuChannel<OpeningData, Out>

  constructor(
    public channelId: string,
    public channelName: string,
    protected openingData: OpeningData
  ) {}

  public abstract send(message: Out, isBinary?: boolean): Promise<void> | void

  public getChannel(): PikkuChannel<OpeningData, Out> {
    if (!this.channel) {
      this.channel = {
        channelId: this.channelId,
        openingData: this.openingData,
        send: this.send.bind(this),
        close: this.close.bind(this),
        state: 'initial',
      }
    }
    return this.channel
  }

  public open(): void {
    this.getChannel().state = 'open'
  }

  public close(): Promise<void> | void {
    this.getChannel().state = 'closed'
  }
}
