import { EventHubService } from '@pikku/core/channel'
import * as uWS from 'uWebSockets.js'

export class UWSEventHubService<Mappings = unknown>
  implements EventHubService<Mappings>
{
  private sockets: Map<string, uWS.WebSocket<unknown>> = new Map()

  constructor() {}

  public async subscribe(topic: string, channelId: string): Promise<void> {
    const socket = this.sockets.get(channelId)
    socket?.subscribe(topic)
  }

  public async unsubscribe(topic: string, channelId: string): Promise<void> {
    const socket = this.sockets.get(channelId)
    socket?.unsubscribe(topic)
  }

  public async publish(
    topic: string,
    channelId: string,
    message: any,
    isBinary?: boolean
  ): Promise<void> {
    const socket = this.sockets.get(channelId)
    if (socket) {
      this.forwardPublishMessage(socket, topic, message, isBinary)
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
