import { EventHubStore } from '@pikku/core/channel'
import type { Db, Collection } from 'mongodb'

interface ChannelSubscriptionDoc {
  channelId: string
  topic: string
}

export class MongoDBEventHubStore extends EventHubStore {
  private initialized = false
  private subscriptions!: Collection<ChannelSubscriptionDoc>

  constructor(private db: Db) {
    super()
  }

  public async init(): Promise<void> {
    if (this.initialized) return
    this.subscriptions = this.db.collection<ChannelSubscriptionDoc>(
      'channel_subscriptions'
    )
    this.initialized = true
  }

  public async getChannelIdsForTopic(topic: string): Promise<string[]> {
    const result = await this.subscriptions
      .find({ topic })
      .project({ channelId: 1 })
      .toArray()
    return result.map((row) => row.channelId)
  }

  public async subscribe(topic: string, channelId: string): Promise<boolean> {
    try {
      await this.subscriptions.updateOne(
        { channelId, topic },
        { $setOnInsert: { channelId, topic } },
        { upsert: true }
      )
      return true
    } catch {
      return false
    }
  }

  public async unsubscribe(topic: string, channelId: string): Promise<boolean> {
    const result = await this.subscriptions.deleteOne({ channelId, topic })
    return result.deletedCount > 0
  }

  public async close(): Promise<void> {}
}
