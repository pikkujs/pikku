import { PikkuAbstractChannelHandler } from '../pikku-abstract-channel-handler.js'

export class PikkuLocalChannelHandler<
  OpeningData = unknown,
  Out = unknown,
> extends PikkuAbstractChannelHandler<OpeningData, Out> {
  private onMessageCallback?: (message: unknown) => void
  private openCallBack?: () => void
  private closeCallback?: () => void
  private sendCallback?: (message: Out, isBinary?: boolean) => void

  public registerOnOpen(callback: () => void): void {
    this.openCallBack = callback
  }

  public open() {
    this.getChannel().state = 'open'
    if (this.openCallBack) {
      this.openCallBack()
    }
  }

  public registerOnMessage(callback: (data: any) => Promise<unknown>): void {
    this.onMessageCallback = callback
  }

  public async message(data: unknown): Promise<unknown> {
    return this.onMessageCallback?.(data)
  }

  public registerOnClose(callback: () => void): void {
    this.closeCallback = callback
  }

  public close() {
    super.close()
    this.closeCallback?.()
  }

  public registerOnSend(send: (message: Out) => void) {
    this.sendCallback = send
  }

  public send(message: Out, isBinary?: boolean): void {
    if (!this.sendCallback) {
      throw new Error('No send callback registered')
    }
    return this.sendCallback?.(message, isBinary)
  }
}
