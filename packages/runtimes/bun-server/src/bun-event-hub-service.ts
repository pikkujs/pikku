import type { ServerWebSocket, Server } from 'bun'

type AnyServer = Server<unknown>
import type { EventHubService, PikkuChannelHandler } from '@pikku/core/channel'
import { LocalEventHubService } from '@pikku/core/channel/local'

export class BunEventHubService<
  Mappings extends Record<string, unknown> = {},
> implements EventHubService<Mappings> {
  private sockets: Map<string, ServerWebSocket<unknown>> = new Map()
  private server: AnyServer | null = null
  private readonly local = new LocalEventHubService<Mappings>()

  public setServer(server: AnyServer): void {
    this.server = server
  }

  public registerSocket(channelId: string, ws: ServerWebSocket<unknown>): void {
    this.sockets.set(channelId, ws)
  }

  public async subscribe<T extends keyof Mappings>(
    topic: T,
    channelId: string
  ): Promise<void> {
    const socket = this.sockets.get(channelId)
    if (socket) {
      socket.subscribe(topic as string)
      return
    }
    await this.local.subscribe(topic, channelId)
  }

  public async unsubscribe<T extends keyof Mappings>(
    topic: T,
    channelId: string
  ): Promise<void> {
    const socket = this.sockets.get(channelId)
    if (socket) {
      socket.unsubscribe(topic as string)
      return
    }
    await this.local.unsubscribe(topic, channelId)
  }

  public async publish<T extends keyof Mappings>(
    topic: T,
    channelId: string | null,
    message: Mappings[T],
    isBinary?: boolean
  ): Promise<void> {
    if (this.server) {
      if (isBinary) {
        this.server.publish(topic as string, message as any, true)
      } else {
        this.server.publish(topic as string, JSON.stringify(message), false)
      }
    }
    await this.local.publish(topic, channelId, message, isBinary)
  }

  public async onChannelOpened(
    channelHandler: PikkuChannelHandler
  ): Promise<void> {
    this.local.onChannelOpened(channelHandler)
  }

  public async onChannelClosed(channelId: string): Promise<void> {
    this.sockets.delete(channelId)
    this.local.onChannelClosed(channelId)
  }
}
