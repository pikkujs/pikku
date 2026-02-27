import type { CoreUserSession } from '@pikku/core'
import type { Channel } from '@pikku/core/channel'
import { ChannelStore } from '@pikku/core/channel'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { parseJson } from './kysely-json.js'

export class KyselyChannelStore extends ChannelStore {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {
    super()
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.db.schema
      .createTable('channels')
      .ifNotExists()
      .addColumn('channel_id', 'text', (col) => col.primaryKey())
      .addColumn('channel_name', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('opening_data', 'text', (col) => col.notNull().defaultTo('{}'))
      .addColumn('user_session', 'text')
      .addColumn('last_wire', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.db.schema
      .createTable('channel_subscriptions')
      .ifNotExists()
      .addColumn('channel_id', 'text', (col) =>
        col.notNull().references('channels.channel_id').onDelete('cascade')
      )
      .addColumn('topic', 'text', (col) => col.notNull())
      .addPrimaryKeyConstraint('channel_subscriptions_pk', [
        'channel_id',
        'topic',
      ])
      .execute()

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
        channel_id: channelId,
        channel_name: channelName,
        opening_data: JSON.stringify(openingData || {}),
      })
      .execute()
  }

  public async removeChannels(channelIds: string[]): Promise<void> {
    if (channelIds.length === 0) {
      return
    }

    await this.db
      .deleteFrom('channels')
      .where('channel_id', 'in', channelIds)
      .execute()
  }

  public async setUserSession(
    channelId: string,
    session: CoreUserSession | null
  ): Promise<void> {
    await this.db
      .updateTable('channels')
      .set({ user_session: session ? JSON.stringify(session) : null })
      .where('channel_id', '=', channelId)
      .execute()
  }

  public async getChannelAndSession(
    channelId: string
  ): Promise<Channel & { session: CoreUserSession }> {
    const row = await this.db
      .selectFrom('channels')
      .select(['channel_id', 'channel_name', 'opening_data', 'user_session'])
      .where('channel_id', '=', channelId)
      .executeTakeFirst()

    if (!row) {
      throw new Error(`Channel not found: ${channelId}`)
    }

    return {
      channelId: row.channel_id,
      channelName: row.channel_name,
      openingData: parseJson(row.opening_data) ?? {},
      session: (parseJson(row.user_session) ?? {}) as CoreUserSession,
    }
  }

  public async close(): Promise<void> {}
}
