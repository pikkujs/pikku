import { CoreUserSession } from '@pikku/core'
import { Channel, ChannelStore } from '@pikku/core/channel'
import postgres from 'postgres'
import { initializeSchema, validateSchemaName } from './schema.js'

/**
 * PostgreSQL-based implementation of ChannelStore
 *
 * Stores channel state in PostgreSQL with configurable schema name.
 * Automatically creates the required schema and tables on initialization.
 *
 * @example
 * ```typescript
 * const sql = postgres({ host, database, user, password })
 * const store = new PgChannelStore(sql, 'my_app')
 * await store.init() // Creates schema and tables
 * ```
 */
export class PgChannelStore extends ChannelStore {
  private sql: postgres.Sql
  private schemaName: string
  private initialized = false
  private ownsConnection: boolean

  /**
   * @param connectionOrConfig - postgres.Sql connection instance or postgres.Options config
   * @param schemaName - PostgreSQL schema name (default: 'pikku')
   */
  constructor(
    connectionOrConfig: postgres.Sql | postgres.Options<{}>,
    schemaName = 'pikku'
  ) {
    super()

    // Validate schema name for security
    validateSchemaName(schemaName)
    this.schemaName = schemaName

    // Check if it's a postgres.Sql instance or config options
    if (typeof connectionOrConfig === 'function') {
      // It's a postgres.Sql instance
      this.sql = connectionOrConfig as postgres.Sql
      this.ownsConnection = false
    } else {
      // It's a config object
      this.sql = postgres(connectionOrConfig)
      this.ownsConnection = true
    }
  }

  /**
   * Initialize the store by creating the schema and tables if they don't exist
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await initializeSchema(this.sql, this.schemaName)

    this.initialized = true
  }

  public async addChannel({
    channelId,
    channelName,
    openingData,
  }: Channel): Promise<void> {
    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.channels
        (channel_id, channel_name, opening_data)
      VALUES
        ($1, $2, $3)`,
      [channelId, channelName, JSON.stringify(openingData || {})]
    )
  }

  public async removeChannels(channelIds: string[]): Promise<void> {
    if (channelIds.length === 0) {
      return
    }

    await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.channels
      WHERE channel_id = ANY($1)`,
      [channelIds]
    )
  }

  public async setUserSession(
    channelId: string,
    session: CoreUserSession | null
  ): Promise<void> {
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.channels
      SET user_session = $1
      WHERE channel_id = $2`,
      [session ? JSON.stringify(session) : null, channelId]
    )
  }

  public async getChannelAndSession(
    channelId: string
  ): Promise<Channel & { session: CoreUserSession }> {
    const result = await this.sql.unsafe(
      `SELECT channel_id, channel_name, opening_data, user_session
      FROM ${this.schemaName}.channels
      WHERE channel_id = $1`,
      [channelId]
    )

    if (result.length === 0) {
      throw new Error(`Channel not found: ${channelId}`)
    }

    const row = result[0]!

    return {
      channelId: row.channel_id as string,
      channelName: row.channel_name as string,
      openingData: row.opening_data as any,
      session: (row.user_session || {}) as CoreUserSession,
    }
  }

  /**
   * Close the database connection if owned by this store
   */
  public async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.sql.end()
    }
  }
}
