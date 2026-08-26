import type { ServerWebSocket, Server } from 'bun'

type AnyServer = Server<unknown>
import type { EventHubService, PikkuChannelHandler } from '@pikku/core/channel'
import { LocalEventHubService } from '@pikku/core/channel/local'

/**
 * Bun's native per-socket topic pub/sub, plus everything that is not a socket.
 *
 * Bun delivers to WebSockets through `server.publish`, which is fast and handles
 * backpressure — but it can only ever reach a WebSocket. An SSE stream opened by
 * the HTTP runner is not a Bun socket, so it would never receive a publish no
 * matter how correctly it subscribed. It therefore gets a `LocalEventHubService`
 * of its own and every publish goes to BOTH: Bun's for the sockets, the local hub
 * for the streams. This mirrors what `PgEventHubService` already does with its
 * built-in fallback hub.
 *
 * `onChannelOpened` is for channels of either kind and takes a handler.
 * `registerSocket` is the Bun-specific extra for handing over the raw socket —
 * a different operation, deliberately under a different name, because conflating
 * the two is exactly the bug this replaced.
 */
export class BunEventHubService<
  Mappings extends Record<string, unknown> = {},
> implements EventHubService<Mappings> {
  private sockets: Map<string, ServerWebSocket<unknown>> = new Map()
  private server: AnyServer | null = null
  /** Channels that are not Bun sockets — SSE streams from the HTTP runner. */
  private readonly local = new LocalEventHubService<Mappings>()

  public setServer(server: AnyServer): void {
    this.server = server
  }

  /** Bun-only: associate a live WebSocket with the channel id it belongs to. */
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
      // Bun's pub/sub has no exclude-one primitive, so `channelId` is honoured
      // only for the locally-held channels below — unchanged from before.
      if (isBinary) {
        this.server.publish(topic as string, message as any, true)
      } else {
        this.server.publish(topic as string, JSON.stringify(message), false)
      }
    }
    // Cheap when there are no SSE subscribers: one map lookup and an early exit.
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
