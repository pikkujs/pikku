import { EventHubStore } from '@pikku/core/channel'
import postgres from 'postgres'
import { initializeSchema, validateSchemaName } from './schema.js'

/**
 * PostgreSQL-based implementation of EventHubStore
 *
 * Manages pub/sub topic subscriptions for channels in PostgreSQL.
 * Shares the same schema and tables as PgChannelStore.
 *
 * @example
 * ```typescript
 * const sql = postgres({ host, database, user, password })
 * const store = new PgEventHubStore(sql, 'my_app')
 * await store.init() // Creates schema and tables if they don't exist
 * await store.subscribe('user.123', channelId)
 * ```
 */
export class PgEventHubStore implements EventHubStore {
  private sql: postgres.Sql
  private schemaName: string
  private initialized = false
  private ownsConnection: boolean

  /**
   * @param connectionOrConfig - postgres.Sql connection instance or postgres.Options config
   * @param schemaName - PostgreSQL schema name (default: 'serverless')
   */
  constructor(
    connectionOrConfig: postgres.Sql | postgres.Options<{}>,
    schemaName = 'pikku'
  ) {
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
   * This is safe to call even if PgChannelStore already initialized the schema
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await initializeSchema(this.sql, this.schemaName)

    this.initialized = true
  }

  public async getChannelIdsForTopic(topic: string): Promise<string[]> {
    const result = await this.sql.unsafe(
      `SELECT channel_id
      FROM ${this.schemaName}.channel_subscriptions
      WHERE topic = $1`,
      [topic]
    )

    return result.map((row) => row.channel_id as string)
  }

  public async subscribe(topic: string, channelId: string): Promise<boolean> {
    try {
      await this.sql.unsafe(
        `INSERT INTO ${this.schemaName}.channel_subscriptions
          (channel_id, topic)
        VALUES
          ($1, $2)
        ON CONFLICT (channel_id, topic) DO NOTHING`,
        [channelId, topic]
      )
      return true
    } catch (error) {
      // If the channel doesn't exist (foreign key violation), return false
      return false
    }
  }

  public async unsubscribe(topic: string, channelId: string): Promise<boolean> {
    const result = await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.channel_subscriptions
      WHERE channel_id = $1
        AND topic = $2`,
      [channelId, topic]
    )

    return result.count > 0
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
