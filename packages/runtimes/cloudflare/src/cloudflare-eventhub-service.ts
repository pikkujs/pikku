import type { DurableObjectState, WebSocket } from '@cloudflare/workers-types'
import type { EventHubService } from '@pikku/core/channel'
import type { Logger } from '@pikku/core/services'

export class CloudflareEventHubService<
  EventTopics extends Record<string, unknown> = {},
> implements EventHubService<EventTopics>
{
  private subscriptions: Map<keyof EventTopics, Set<string>> = new Map()
  private isDirty = false
  private state: 'initial' | 'loading' | 'ready' = 'initial'
  private loadedCallbacks: (() => void)[] = []

  constructor(
    private logger: Logger,
    private ctx: DurableObjectState,
    private namespace: string = 'subscriptions'
  ) {
    // Ensure state is saved before hibernation
    ctx.blockConcurrencyWhile(async () => {
      if (this.isDirty) {
        await this.syncSubscriptions()
      }
    })
  }

  private async ensureSubscriptionsLoaded(): Promise<void> {
    if (this.state === 'initial') {
      this.state = 'loading'
      const storedSubscriptions = await this.ctx.storage.get<string>(
        this.namespace
      )
      if (storedSubscriptions) {
        const parsedSubscriptions = JSON.parse(storedSubscriptions)
        this.subscriptions = new Map(
          Object.entries<string[]>(parsedSubscriptions).map(
            ([topic, channelIds]) => [topic, new Set(channelIds)]
          )
        )
      }
      this.state = 'ready'
    } else if (this.state === 'loading') {
      this.loadedCallbacks = []
      await new Promise<void>((resolve) => {
        this.loadedCallbacks.push(resolve)
      })
    }
  }

  /**
   * Synchronize in-memory subscriptions with Durable Object storage.
   */
  private async syncSubscriptions(): Promise<void> {
    if (!this.isDirty) return
    const serializedSubscriptions = Object.fromEntries(
      Array.from(this.subscriptions.entries()).map(([topic, channelIds]) => [
        topic,
        Array.from(channelIds),
      ])
    )
    await this.ctx.storage.put(
      this.namespace,
      JSON.stringify(serializedSubscriptions)
    )
    this.isDirty = false
  }

  /**
   * Subscribes a connection to a specific topic.
   */
  public async subscribe<T extends keyof EventTopics>(
    topic: T,
    channelId: string
  ): Promise<void> {
    await this.ensureSubscriptionsLoaded()

    const topicStr = String(topic)
    if (!this.subscriptions.has(topicStr)) {
      this.subscriptions.set(topicStr, new Set())
    }
    this.subscriptions.get(topicStr)?.add(channelId)
    this.isDirty = true
  }

  /**
   * Unsubscribes a connection from a specific topic.
   */
  public async unsubscribe<T extends keyof EventTopics>(
    topic: T,
    channelId: string
  ): Promise<void> {
    await this.ensureSubscriptionsLoaded()

    const channelIds = this.subscriptions.get(topic)
    if (channelIds) {
      channelIds.delete(channelId)
      if (channelIds.size === 0) {
        this.subscriptions.delete(topic)
      }
      this.isDirty = true
    }
  }

  /**
   * Sends data to all connections subscribed to a specific topic.
   * @param topic - The topic to send data to.
   * @param data - The data to send to the subscribers.
   * @param isBinary - Indicates if the data is binary.
   */
  public async publish<T extends keyof EventTopics>(
    topic: T,
    fromChannelId: string,
    data: EventTopics[T],
    isBinary: boolean = false
  ) {
    await this.ensureSubscriptionsLoaded()

    const channelIds = this.subscriptions.get(topic)
    if (!channelIds) {
      this.logger.warn(`No subscribers for topic: ${topic.toString()}`)
      return
    }
    for (const channelId of channelIds) {
      if (fromChannelId === channelId) {
        continue
      }
      try {
        const websocket = this.getWebsocket(channelId)
        if (!websocket) {
          // The socket doesn't exist, which means
          // we should clean it up
          console.error(`Socket ${channelId} doesn't exist, cleaning up`)
          this.onChannelClosed(channelId)
        } else {
          websocket.send(JSON.stringify(data))
        }
      } catch (error) {
        this.logger.error(
          `Failed to send message to ${channelId} on topic ${topic.toString()}:`,
          error
        )
      }
    }
  }

  /**
   * Handles cleanup when a channel is closed.
   */
  public async onChannelClosed(channelId: string): Promise<void> {
    for (const [topic, channelIds] of this.subscriptions.entries()) {
      if (channelIds.delete(channelId)) {
        if (channelIds.size === 0) {
          this.subscriptions.delete(topic)
        }
        this.isDirty = true
      }
    }
  }

  /**
   * Retrieves the WebSocket associated with a channel ID.
   * @param channelId - The channel ID to get the WebSocket for.
   * @returns The WebSocket instance.
   */
  private getWebsocket(channelId: string): WebSocket | undefined {
    const [websocket] = this.ctx.getWebSockets(channelId)
    return websocket
  }
}
