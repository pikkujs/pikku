import type { EventHubService, PikkuChannelHandler } from '@pikku/core/channel'
import { LocalEventHubService } from '@pikku/core/channel/local'
import type * as uWS from 'uWebSockets.js'

/**
 * uWebSockets' native topic pub/sub, plus everything that is not a socket.
 *
 * Same split as the Bun hub, for the same reason: `socket.publish` reaches only
 * WebSockets, so an SSE stream opened by the HTTP runner is registered on a
 * `LocalEventHubService` instead and every publish goes to both. See
 * `EventHubService` for why `onChannelOpened` takes a handler and the raw socket
 * goes through `registerSocket`.
 */
export class UWSEventHubService<
  Mappings extends Record<string, unknown> = {},
> implements EventHubService<Mappings> {
  private sockets: Map<string, uWS.WebSocket<unknown>> = new Map()
  /** Channels that are not uWS sockets — SSE streams from the HTTP runner. */
  private readonly local = new LocalEventHubService<Mappings>()

  constructor() {}

  /** uWS-only: associate a live WebSocket with the channel id it belongs to. */
  public registerSocket(
    channelId: string,
    socket: uWS.WebSocket<unknown>
  ): void {
    this.sockets.set(channelId, socket)
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
    // uWS fans out from any socket in the app, so one is enough to reach every
    // WebSocket subscriber; `channelId` selects it only to avoid an arbitrary
    // pick, and exclusion is honoured by the local hub below.
    let socket: uWS.WebSocket<unknown> | undefined
    if (channelId) {
      socket = this.sockets.get(channelId)
    }
    socket = socket ?? this.sockets.values().next().value
    if (socket) {
      this.forwardPublishMessage(socket, topic as string, message, isBinary)
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
