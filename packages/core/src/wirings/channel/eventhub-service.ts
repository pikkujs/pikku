import type { PikkuChannelHandler } from './channel.types.js'

/**
 * Fan-out to everything currently listening on a topic.
 *
 * THE LIFECYCLE METHODS ARE PART OF THE CONTRACT, and that is the point of
 * declaring them here. They used to be called but never typed, so two
 * incompatible conventions grew up unnoticed — `onChannelOpened(handler)` in
 * core and `onChannelOpened(channelId, socket)` in the Bun and uWS runtimes.
 * Neither side could see the other, so an SSE stream on Bun registered itself
 * under an object key, every `subscribe` missed, and the connection stayed open
 * and silent. A held-open connection that delivers nothing is the worst way for
 * this to fail, so the signature is now single and mandatory.
 *
 * `PikkuChannelHandler` is the only shape that can describe BOTH transports: it
 * abstracts `send`/`sendBinary` away from whatever is underneath, so an SSE
 * response stream is as registrable as a WebSocket. Runtimes that additionally
 * need the raw socket expose that as their own separate method (Bun and uWS call
 * it `registerSocket`) rather than overloading this one.
 *
 * A hub that genuinely cannot deliver to a non-socket channel — Lambda and
 * Cloudflare, where the stream and the publisher are not even in the same
 * isolate — must THROW from `onChannelOpened` rather than accept and drop.
 */
export interface EventHubService<Topics extends Record<string, any>> {
  subscribe<T extends keyof Topics>(
    topic: T,
    channelId: string
  ): Promise<void> | void
  unsubscribe<T extends keyof Topics>(
    topic: T,
    channelId: string
  ): Promise<void> | void
  publish<T extends keyof Topics>(
    topic: T,
    channelId: string | null,
    data: Topics[T],
    isBinary?: boolean
  ): Promise<void> | void

  /**
   * A channel — a WebSocket or an SSE stream — is now available for delivery.
   * Throws if this hub cannot deliver to the kind of channel it is handed.
   */
  onChannelOpened(channelHandler: PikkuChannelHandler): Promise<void> | void

  /** The channel is gone; drop it and its subscriptions. */
  onChannelClosed(channelId: string): Promise<void> | void
}
