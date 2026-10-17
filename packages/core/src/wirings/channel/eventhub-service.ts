/**
 * Pub/sub between channels, available as `eventHub` on singleton services.
 *
 * Channels `subscribe` to topics, and `publish` sends to every subscriber of a
 * topic. Passing the publishing channel's id as `channelId` excludes it from
 * delivery; `null` sends to all.
 *
 * @example snippet: channelPubSub
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
}
