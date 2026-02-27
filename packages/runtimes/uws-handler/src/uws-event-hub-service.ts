import type { EventHubService } from '@pikku/core/channel'
import type * as uWS from 'uWebSockets.js'

export class UWSEventHubService<Mappings extends Record<string, unknown> = {}>
  implements EventHubService<Mappings>
{
  private sockets: Map<string, uWS.WebSocket<unknown>> = new Map()

  constructor() {}

  public async subscribe<T extends keyof Mappings>(
    topic: T,
    channelId: string
  ): Promise<void> {
    const socket = this.sockets.get(channelId)
    socket?.subscribe(topic as string)
  }

  public async unsubscribe<T extends keyof Mappings>(
    topic: T,
    channelId: string
  ): Promise<void> {
    const socket = this.sockets.get(channelId)
    socket?.unsubscribe(topic as string)
  }

  public async publish<T extends keyof Mappings>(
    topic: T,
    channelId: string | null,
    message: Mappings[T],
    isBinary?: boolean
  ): Promise<void> {
    let socket: uWS.WebSocket<unknown> | undefined
    if (channelId) {
      socket = this.sockets.get(channelId)
    } else {
      socket = this.sockets.values().next().value
    }
    if (socket) {
      this.forwardPublishMessage(socket, topic as string, message, isBinary)
    }
  }

  public async onChannelOpened(
    channelId: string,
    socket: uWS.WebSocket<unknown>
  ): Promise<void> {
    this.sockets.set(channelId, socket)
  }

  public async onChannelClosed(channelId: string): Promise<void> {
    this.sockets.delete(channelId)
  }

  private forwardPublishMessage(
    source: uWS.TemplatedApp | uWS.WebSocket<unknown>,
    topic: string,
    message: any,
    isBinary?: boolean
  ): void {
    if (isBinary) {
      source?.publish(topic, message, true)
    } else {
      source?.publish(topic, JSON.stringify(message), false)
    }
  }
}
