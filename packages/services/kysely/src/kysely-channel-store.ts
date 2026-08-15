import { ChannelStore } from '@pikku/core/ecosystem/channel'
import type { Channel } from '@pikku/core/ecosystem/channel'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { parseJson } from './kysely-json.js'
import { ensurePikkuSchema } from './schema/index.js'
import { channelSchema } from './schema/channel.schema.js'

export class KyselyChannelStore extends ChannelStore {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {
    super()
  }

  public async init(): Promise<void> {
    if (this.initialized) return
    await ensurePikkuSchema(this.db, channelSchema)
    this.initialized = true
  }

  public async addChannel({
    channelId,
    channelName,
    openingData,
  }: Channel): Promise<void> {
    await this.db
      .insertInto('channels')
      .values({
        channelId: channelId,
        channelName: channelName,
        openingData: JSON.stringify(openingData || {}),
      })
      .execute()
  }

  public async removeChannels(channelIds: string[]): Promise<void> {
    if (channelIds.length === 0) {
      return
    }

    await this.db
      .deleteFrom('channels')
      .where('channelId', 'in', channelIds)
      .execute()
  }

  public async setPikkuUserId(
    channelId: string,
    pikkuUserId: string | null
  ): Promise<void> {
    await this.db
      .updateTable('channels')
      .set({ pikkuUserId })
      .where('channelId', '=', channelId)
      .execute()
  }

  public async getChannel(
    channelId: string
  ): Promise<Channel & { pikkuUserId?: string }> {
    const row = await this.db
      .selectFrom('channels')
      .select(['channelId', 'channelName', 'openingData', 'pikkuUserId'])
      .where('channelId', '=', channelId)
      .executeTakeFirst()

    if (!row) {
      throw new Error(`Channel not found: ${channelId}`)
    }

    return {
      channelId: row.channelId,
      channelName: row.channelName,
      openingData: parseJson(row.openingData) ?? {},
      pikkuUserId: row.pikkuUserId ?? undefined,
    }
  }

  public async setState(channelId: string, state: unknown): Promise<void> {
    await this.db
      .updateTable('channels')
      .set({ state: JSON.stringify(state ?? null) })
      .where('channelId', '=', channelId)
      .execute()
  }

  public async getState(channelId: string): Promise<unknown | undefined> {
    const row = await this.db
      .selectFrom('channels')
      .select(['state'])
      .where('channelId', '=', channelId)
      .executeTakeFirst()
    if (!row || !row.state) return undefined
    return parseJson(row.state) ?? undefined
  }

  public async clearState(channelId: string): Promise<void> {
    await this.db
      .updateTable('channels')
      .set({ state: null })
      .where('channelId', '=', channelId)
      .execute()
  }

  public async close(): Promise<void> {}
}
