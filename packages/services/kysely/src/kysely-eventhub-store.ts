import { EventHubStore } from '@pikku/core/channel'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'

export class KyselyEventHubStore extends EventHubStore {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {
    super()
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }
    this.initialized = true
  }

  public async getChannelIdsForTopic(topic: string): Promise<string[]> {
    const result = await this.db
      .selectFrom('channel_subscriptions')
      .select('channel_id')
      .where('topic', '=', topic)
      .execute()

    return result.map((row) => row.channel_id)
  }

  public async subscribe(topic: string, channelId: string): Promise<boolean> {
    try {
      await this.db
        .insertInto('channel_subscriptions')
        .values({ channel_id: channelId, topic: topic as string })
        .onConflict((oc) => oc.columns(['channel_id', 'topic']).doNothing())
        .execute()
      return true
    } catch {
      return false
    }
  }

  public async unsubscribe(topic: string, channelId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('channel_subscriptions')
      .where('channel_id', '=', channelId)
      .where('topic', '=', topic as string)
      .executeTakeFirst()

    return BigInt(result.numDeletedRows) > 0n
  }

  public async close(): Promise<void> {}
}
