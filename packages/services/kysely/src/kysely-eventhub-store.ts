import { EventHubStore } from '@pikku/core/channel'
import { Kysely } from 'kysely'

export class KyselyEventHubStore implements EventHubStore {
  constructor(private database: Kysely<any>) {}

  public async getChannelIdsForTopic(topic: string): Promise<string[]> {
    const result = await this.database
      .selectFrom('serverless.lambdaChannelSubscriptions')
      .select('channelId')
      .where('topic', '=', topic)
      .execute()
    return result.map((row) => row.channelId)
  }

  public async subscribe(topic: string, channelId: string): Promise<boolean> {
    await this.database
      .insertInto('serverless.lambdaChannelSubscriptions')
      .values({ channelId, topic })
      .execute()
    return true
  }

  public async unsubscribe(topic: string, channelId: string): Promise<boolean> {
    await this.database
      .deleteFrom('serverless.lambdaChannelSubscriptions')
      .where('channelId', '=', channelId)
      .where('topic', '=', topic)
      .execute()
    return true
  }
}
