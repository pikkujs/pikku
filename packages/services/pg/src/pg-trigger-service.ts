import type { CoreSingletonServices } from '@pikku/core'
import {
  TriggerService,
  TriggerRegistration,
  TriggerInputInstance,
} from '@pikku/core'
import postgres from 'postgres'

/**
 * PostgreSQL-based implementation of TriggerService
 *
 * Stores trigger registrations and manages distributed claiming with heartbeat-based locking.
 *
 * @example
 * ```typescript
 * const sql = postgres('postgresql://localhost:5432/pikku')
 * const triggerService = new PgTriggerService(singletonServices, sql, 'pikku')
 * await triggerService.init()
 *
 * // Register a trigger target
 * await triggerService.register({
 *   trigger: 'redis-subscribe',
 *   input: { channel: 'my-channel' },
 *   target: { rpc: 'processMessage' }
 * })
 *
 * // Start triggers
 * await triggerService.start()
 * ```
 */
export class PgTriggerService extends TriggerService {
  private sql: postgres.Sql
  private schemaName: string
  private initialized = false
  private ownsConnection: boolean
  private heartbeatTimeoutSeconds: number

  /**
   * @param singletonServices - Core singleton services
   * @param connectionOrConfig - postgres.Sql connection instance or postgres.Options config
   * @param schemaName - PostgreSQL schema name (default: 'pikku')
   * @param heartbeatTimeoutSeconds - Seconds before a claim expires (default: 30)
   */
  constructor(
    singletonServices: CoreSingletonServices,
    connectionOrConfig: postgres.Sql | postgres.Options<{}>,
    schemaName = 'pikku',
    heartbeatTimeoutSeconds = 30
  ) {
    super(singletonServices)
    this.schemaName = schemaName
    this.heartbeatTimeoutSeconds = heartbeatTimeoutSeconds

    // Check if it's a postgres.Sql instance or config options
    if (typeof connectionOrConfig === 'function') {
      this.sql = connectionOrConfig as postgres.Sql
      this.ownsConnection = false
    } else {
      this.sql = postgres(connectionOrConfig)
      this.ownsConnection = true
    }
  }

  /**
   * Initialize the service by creating the schema and tables if they don't exist
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.sql.unsafe(`
      CREATE SCHEMA IF NOT EXISTS ${this.schemaName};

      -- Stores trigger -> target associations
      CREATE TABLE IF NOT EXISTS ${this.schemaName}.trigger_registrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trigger_name VARCHAR NOT NULL,
        input_hash VARCHAR NOT NULL,
        input_data JSONB NOT NULL,
        target_type VARCHAR NOT NULL,
        target_name VARCHAR NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(trigger_name, input_hash, target_type, target_name)
      );

      -- Tracks which process owns each trigger subscription
      CREATE TABLE IF NOT EXISTS ${this.schemaName}.trigger_instances (
        trigger_name VARCHAR NOT NULL,
        input_hash VARCHAR NOT NULL,
        input_data JSONB NOT NULL,
        owner_process_id VARCHAR NOT NULL,
        heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (trigger_name, input_hash)
      );

      -- Index for querying targets when trigger fires
      CREATE INDEX IF NOT EXISTS idx_trigger_registrations_lookup
        ON ${this.schemaName}.trigger_registrations(trigger_name, input_hash);
    `)

    this.initialized = true
  }

  // ============================================
  // Abstract method implementations
  // ============================================

  protected async storeRegistration(
    registration: TriggerRegistration
  ): Promise<void> {
    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.trigger_registrations
        (trigger_name, input_hash, input_data, target_type, target_name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (trigger_name, input_hash, target_type, target_name) DO NOTHING`,
      [
        registration.triggerName,
        registration.inputHash,
        JSON.stringify(registration.inputData),
        registration.targetType,
        registration.targetName,
      ]
    )
  }

  protected async removeRegistration(
    registration: TriggerRegistration
  ): Promise<void> {
    await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.trigger_registrations
      WHERE trigger_name = $1 AND input_hash = $2 AND target_type = $3 AND target_name = $4`,
      [
        registration.triggerName,
        registration.inputHash,
        registration.targetType,
        registration.targetName,
      ]
    )
  }

  protected async getDistinctTriggerInputs(
    supportedTriggers?: string[]
  ): Promise<TriggerInputInstance[]> {
    let query: string
    let params: any[]

    if (supportedTriggers && supportedTriggers.length > 0) {
      query = `
        SELECT DISTINCT trigger_name, input_hash, input_data
        FROM ${this.schemaName}.trigger_registrations
        WHERE trigger_name = ANY($1)
      `
      params = [supportedTriggers]
    } else {
      query = `
        SELECT DISTINCT trigger_name, input_hash, input_data
        FROM ${this.schemaName}.trigger_registrations
      `
      params = []
    }

    const result = await this.sql.unsafe(query, params)

    return result.map((row) => ({
      triggerName: row.trigger_name as string,
      inputHash: row.input_hash as string,
      inputData: this.parseJsonb(row.input_data),
    }))
  }

  protected async getTargetsForTrigger(
    triggerName: string,
    inputHash: string
  ): Promise<Array<{ targetType: 'rpc' | 'workflow'; targetName: string }>> {
    const result = await this.sql.unsafe(
      `SELECT target_type, target_name
      FROM ${this.schemaName}.trigger_registrations
      WHERE trigger_name = $1 AND input_hash = $2`,
      [triggerName, inputHash]
    )

    return result.map((row) => ({
      targetType: row.target_type as 'rpc' | 'workflow',
      targetName: row.target_name as string,
    }))
  }

  protected async tryClaimInstance(
    triggerName: string,
    inputHash: string,
    inputData: unknown
  ): Promise<boolean> {
    // Atomic claim: insert or update if expired
    const result = await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.trigger_instances
        (trigger_name, input_hash, input_data, owner_process_id, heartbeat_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (trigger_name, input_hash)
      DO UPDATE SET
        owner_process_id = $4,
        heartbeat_at = NOW()
      WHERE ${this.schemaName}.trigger_instances.heartbeat_at < NOW() - INTERVAL '${this.heartbeatTimeoutSeconds} seconds'
         OR ${this.schemaName}.trigger_instances.owner_process_id = $4
      RETURNING *`,
      [triggerName, inputHash, JSON.stringify(inputData), this.processId]
    )

    return result.length > 0
  }

  protected async releaseInstance(
    triggerName: string,
    inputHash: string
  ): Promise<void> {
    await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.trigger_instances
      WHERE trigger_name = $1 AND input_hash = $2 AND owner_process_id = $3`,
      [triggerName, inputHash, this.processId]
    )
  }

  protected async updateHeartbeat(): Promise<void> {
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.trigger_instances
      SET heartbeat_at = NOW()
      WHERE owner_process_id = $1`,
      [this.processId]
    )
  }

  // ============================================
  // Helpers
  // ============================================

  private parseJsonb(value: unknown): unknown {
    if (typeof value === 'string') {
      return JSON.parse(value)
    }
    return value
  }

  // ============================================
  // Additional public methods
  // ============================================

  /**
   * Close the database connection if we own it
   */
  async close(): Promise<void> {
    await this.stop()
    if (this.ownsConnection) {
      await this.sql.end()
    }
  }

  /**
   * Get all registered triggers (for debugging/admin purposes)
   */
  async getAllRegistrations(): Promise<TriggerRegistration[]> {
    const result = await this.sql.unsafe(
      `SELECT trigger_name, input_hash, input_data, target_type, target_name
      FROM ${this.schemaName}.trigger_registrations
      ORDER BY trigger_name, input_hash`
    )

    return result.map((row) => ({
      triggerName: row.trigger_name as string,
      inputHash: row.input_hash as string,
      inputData: this.parseJsonb(row.input_data),
      targetType: row.target_type as 'rpc' | 'workflow',
      targetName: row.target_name as string,
    }))
  }

  /**
   * Get all claimed instances (for debugging/admin purposes)
   */
  async getClaimedInstances(): Promise<
    Array<{
      triggerName: string
      inputHash: string
      ownerProcessId: string
      heartbeatAt: Date
    }>
  > {
    const result = await this.sql.unsafe(
      `SELECT trigger_name, input_hash, owner_process_id, heartbeat_at
      FROM ${this.schemaName}.trigger_instances
      ORDER BY trigger_name, input_hash`
    )

    return result.map((row) => ({
      triggerName: row.trigger_name as string,
      inputHash: row.input_hash as string,
      ownerProcessId: row.owner_process_id as string,
      heartbeatAt: new Date(row.heartbeat_at as string),
    }))
  }

  /**
   * Clean up expired claims (useful for maintenance)
   */
  async cleanupExpiredClaims(): Promise<number> {
    const result = await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.trigger_instances
      WHERE heartbeat_at < NOW() - INTERVAL '${this.heartbeatTimeoutSeconds} seconds'
      RETURNING *`
    )

    return result.length
  }
}
