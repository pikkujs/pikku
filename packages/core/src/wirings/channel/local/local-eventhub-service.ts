import type { PikkuChannelHandler } from '../channel.types.js'
import type { EventHubService } from '../eventhub-service.js'

export class LocalEventHubService<
  Data extends Record<string, any> = {},
> implements EventHubService<Data> {
  private channels = new Map<string, PikkuChannelHandler>()
  private subscriptions: Map<keyof Data, Set<string>> = new Map()

  public subscribe<T extends keyof Data>(
    topic: T,
    channelId: string
  ): void | Promise<void> {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set())
    }
    this.subscriptions.get(topic)!.add(channelId)
  }

  public unsubscribe<T extends keyof Data>(
    topic: T,
    channelId: string
  ): void | Promise<void> {
    const topicSubscriptions = this.subscriptions.get(topic)
    if (topicSubscriptions) {
      topicSubscriptions.delete(channelId)
      if (topicSubscriptions.size === 0) {
        this.subscriptions.delete(topic)
      }
    }
  }

  public publish<T extends keyof Data>(
    topic: T,
    channelId: string | null,
    data: Data[T],
    isBinary?: boolean
  ): void | Promise<void> {
    const subscribedChannelIds = this.subscriptions.get(topic)
    if (!subscribedChannelIds) {
      return
    }
    for (const toChannelId of subscribedChannelIds) {
      if (channelId === toChannelId) continue
      const channel = this.channels.get(toChannelId)
      if (channel) {
        try {
          channel.send(data, isBinary)
        } catch {
          this.onChannelClosed(toChannelId)
        }
      }
    }
  }

  public onChannelOpened(channelHandler: PikkuChannelHandler): void {
    this.channels.set(channelHandler.getChannel().channelId, channelHandler)
  }

  public onChannelClosed(channelId: string): void {
    for (const [topic, channelIds] of this.subscriptions.entries()) {
      channelIds.delete(channelId)
      if (channelIds.size === 0) {
        this.subscriptions.delete(topic)
      }
    }
    this.channels.delete(channelId)
  }
}
