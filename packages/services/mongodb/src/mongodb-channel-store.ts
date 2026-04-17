import type { Channel } from '@pikku/core/channel'
import { ChannelStore } from '@pikku/core/channel'
import type { Db, Collection } from 'mongodb'

interface ChannelDoc {
  _id: string
  channelName: string
  createdAt: Date
  openingData: any
  pikkuUserId: string | null
  lastWire: Date
}

interface ChannelSubscriptionDoc {
  channelId: string
  topic: string
}

export class MongoDBChannelStore extends ChannelStore {
  private initialized = false
  private channels!: Collection<ChannelDoc>
  private subscriptions!: Collection<ChannelSubscriptionDoc>

  constructor(private db: Db) {
    super()
  }

  public async init(): Promise<void> {
    if (this.initialized) return

    this.channels = this.db.collection<ChannelDoc>('channels')
    this.subscriptions = this.db.collection<ChannelSubscriptionDoc>(
      'channel_subscriptions'
    )

    await this.subscriptions.createIndex(
      { channelId: 1, topic: 1 },
      { unique: true }
    )
    await this.subscriptions.createIndex({ topic: 1 })

    this.initialized = true
  }

  public async addChannel({
    channelId,
    channelName,
    openingData,
  }: Channel): Promise<void> {
    await this.channels.insertOne({
      _id: channelId,
      channelName,
      openingData: openingData || {},
      pikkuUserId: null,
      createdAt: new Date(),
      lastWire: new Date(),
    })
  }

  public async removeChannels(channelIds: string[]): Promise<void> {
    if (channelIds.length === 0) return

    await this.channels.deleteMany({ _id: { $in: channelIds } })
    await this.subscriptions.deleteMany({ channelId: { $in: channelIds } })
  }

  public async setPikkuUserId(
    channelId: string,
    pikkuUserId: string | null
  ): Promise<void> {
    await this.channels.updateOne({ _id: channelId }, { $set: { pikkuUserId } })
  }

  public async getChannel(
    channelId: string
  ): Promise<Channel & { pikkuUserId?: string }> {
    const row = await this.channels.findOne({ _id: channelId })

    if (!row) {
      throw new Error(`Channel not found: ${channelId}`)
    }

    return {
      channelId: row._id,
      channelName: row.channelName,
      openingData: row.openingData ?? {},
      pikkuUserId: row.pikkuUserId ?? undefined,
    }
  }

  public async close(): Promise<void> {}
}
