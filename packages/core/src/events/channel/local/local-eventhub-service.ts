import { PikkuChannelHandler } from '../channel.types.js'
import { EventHubService } from '../eventhub-service.js'

/**
 * Implementation of the SubscriptionService interface.
 * Manages subscriptions and publishes messages to subscribers.
 */
export class LocalEventHubService<Data = unknown>
  implements EventHubService<Data>
{
  private channels = new Map<string, PikkuChannelHandler>()

  /**
   * A map storing topics and their associated connection IDs.
   */
  private subscriptions: Map<string, Set<string>> = new Map()

  /**
   * Subscribes a connection to a specific topic.
   * Creates the topic if it does not already exist.
   * @param topic - The topic to subscribe to.
   * @param channelId - The unique ID of the connection to subscribe.
   */
  public subscribe(topic: string, channelId: string): void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set())
    }
    this.subscriptions.get(topic)!.add(channelId)
  }

  /**
   * Unsubscribes a connection from a specific topic.
   * Removes the topic if it has no more subscribers.
   * @param topic - The topic to unsubscribe from.
   * @param channelId - The unique ID of the connection to unsubscribe.
   */
  public unsubscribe(topic: string, channelId: string): void {
    const topicSubscriptions = this.subscriptions.get(topic)
    if (topicSubscriptions) {
      topicSubscriptions.delete(channelId)
      if (topicSubscriptions.size === 0) {
        this.subscriptions.delete(topic) // Cleanup empty subscriptions
      }
    }
  }

  /**
   * Sends data to all connections subscribed to a topic.
   * @param topic - The topic to send data to.
   * @param data - The data to send to the subscribers.
   */
  public publish(
    topic: string,
    channelId: string,
    data: Data,
    isBinary?: boolean
  ): void {
    const subscribedChannelIds = this.subscriptions.get(topic)
    if (!subscribedChannelIds) {
      return
    }
    for (const toChannelId of subscribedChannelIds) {
      if (channelId === toChannelId) continue // Skip sending to the sender
      const channel = this.channels.get(toChannelId)
      if (channel) {
        channel.send(data, isBinary)
      } else {
        // TODO: Websocket is closed, remove the channel from the topic
      }
    }
  }

  /**
   * Registers a channel on open
   */
  public onChannelOpened(channelHandler: PikkuChannelHandler): void {
    this.channels.set(channelHandler.getChannel().channelId, channelHandler)
  }

  /**
   * Handles cleanup when a channel is closed.
   * Removes the channel from all topics it is subscribed to.
   * Deletes the topic if no more channels are subscribed to it.
   * @param channelId - The ID of the channel that was closed.
   */
  public onChannelClosed(channelId: string): void {
    for (const [topic, channelIds] of this.subscriptions.entries()) {
      channelIds.delete(channelId)
      if (channelIds.size === 0) {
        this.subscriptions.delete(topic) // Cleanup empty topics
      }
    }
    this.channels.delete(channelId)
  }
}
