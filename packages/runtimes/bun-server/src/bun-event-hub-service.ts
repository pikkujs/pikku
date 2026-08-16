import type { ServerWebSocket, Server } from 'bun'

type AnyServer = Server<unknown>
import type { EventHubService } from '@pikku/core/channel'

export class BunEventHubService<
  Mappings extends Record<string, unknown> = {},
> implements EventHubService<Mappings> {
  private sockets: Map<string, ServerWebSocket<unknown>> = new Map()
  private server: AnyServer | null = null

  public setServer(server: AnyServer): void {
    this.server = server
  }

  public async subscribe<T extends keyof Mappings>(
    topic: T,
    channelId: string
  ): Promise<void> {
    this.sockets.get(channelId)?.subscribe(topic as string)
  }

  public async unsubscribe<T extends keyof Mappings>(
    topic: T,
    channelId: string
  ): Promise<void> {
    this.sockets.get(channelId)?.unsubscribe(topic as string)
  }

  public async publish<T extends keyof Mappings>(
    topic: T,
    channelId: string | null,
    message: Mappings[T],
    isBinary?: boolean
  ): Promise<void> {
    if (!this.server) return
    if (isBinary) {
      this.server.publish(topic as string, message as any, true)
    } else {
      this.server.publish(topic as string, JSON.stringify(message), false)
    }
  }

  public async onChannelOpened(
    channelId: string,
    ws: ServerWebSocket<unknown>
  ): Promise<void> {
    this.sockets.set(channelId, ws)
  }

  public async onChannelClosed(channelId: string): Promise<void> {
    this.sockets.delete(channelId)
  }
}
