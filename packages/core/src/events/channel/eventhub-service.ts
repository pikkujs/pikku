/**
 * Interface defining the methods of a EventHub Service.
 */
export interface EventHubService<Topics extends Record<string, any>> {
  /**
   * Subscribes a connection to a specific topic.
   * @param topic - The topic to subscribe to.
   * @param channelId - The unique ID of the connection to subscribe.
   */
  subscribe<T extends keyof Topics>(
    topic: T,
    channelId: string
  ): Promise<void> | void
  /**
   * Unsubscribes a connection from a specific topic.
   * @param topic - The topic to unsubscribe from.
   * @param channelId - The unique ID of the connection to unsubscribe.
   */
  unsubscribe<T extends keyof Topics>(
    topic: T,
    channelId: string
  ): Promise<void> | void
  /**
   * Sends data to all connections subscribed to a topic.
   * @param topic - The topic to send data to.
   * @param data - The data to send to the subscribers.
   */
  publish<T extends keyof Topics>(
    topic: T,
    channelId: string | null,
    data: Topics[T],
    isBinary?: boolean
  ): Promise<void> | void
}
