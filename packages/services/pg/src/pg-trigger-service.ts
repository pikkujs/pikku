import type { CoreSingletonServices, DeploymentService } from '@pikku/core'
import {
  TriggerService,
  TriggerRegistration,
  TriggerInputInstance,
} from '@pikku/core'
import postgres from 'postgres'

/**
 * PostgreSQL-based implementation of TriggerService
 *
 * Stores trigger registrations and manages distributed claiming.
 * Uses DeploymentService for liveness checks instead of heartbeat-based locking.
 *
 * @example
 * ```typescript
 * const sql = postgres('postgresql://localhost:5432/pikku')
 * const deploymentService = new PgDeploymentService(sql, 'pikku')
 * const triggerService = new PgTriggerService(singletonServices, deploymentService, sql, 'pikku')
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

  /**
   * @param singletonServices - Core singleton services
   * @param deploymentService - DeploymentService for liveness checks
   * @param connectionOrConfig - postgres.Sql connection instance or postgres.Options config
   * @param schemaName - PostgreSQL schema name (default: 'pikku')
   */
  constructor(
    singletonServices: CoreSingletonServices,
    deploymentService: DeploymentService,
    connectionOrConfig: postgres.Sql | postgres.Options<{}>,
    schemaName = 'pikku'
  ) {
    super(singletonServices, deploymentService)
    this.schemaName = schemaName

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
        trigger_name VARCHAR NOT NULL,
        input_hash VARCHAR NOT NULL,
        input_data JSONB NOT NULL,
        target_type VARCHAR NOT NULL,
        target_name VARCHAR NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (trigger_name, input_hash, target_type, target_name)
      );

      -- Tracks which deployments are interested in each trigger+input
      CREATE TABLE IF NOT EXISTS ${this.schemaName}.trigger_registration_deployments (
        trigger_name VARCHAR NOT NULL,
        input_hash VARCHAR NOT NULL,
        deployment_id VARCHAR NOT NULL,
        PRIMARY KEY (trigger_name, input_hash, deployment_id)
      );

      -- Tracks which deployment owns each trigger subscription
      CREATE TABLE IF NOT EXISTS ${this.schemaName}.trigger_instances (
        trigger_name VARCHAR NOT NULL,
        input_hash VARCHAR NOT NULL,
        input_data JSONB NOT NULL,
        owner_deployment_id VARCHAR NOT NULL,
        claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (trigger_name, input_hash)
      );
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

    // Associate this deployment with the trigger+input
    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.trigger_registration_deployments
        (trigger_name, input_hash, deployment_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (trigger_name, input_hash, deployment_id) DO NOTHING`,
      [
        registration.triggerName,
        registration.inputHash,
        this.deploymentService.deploymentId,
      ]
    )
  }

  protected async removeRegistration(
    registration: TriggerRegistration
  ): Promise<void> {
    await this.sql.unsafe(
      `WITH del AS (
        DELETE FROM ${this.schemaName}.trigger_registrations
        WHERE trigger_name = $1 AND input_hash = $2 AND target_type = $3 AND target_name = $4
      )
      DELETE FROM ${this.schemaName}.trigger_registration_deployments
      WHERE trigger_name = $1 AND input_hash = $2
        AND NOT EXISTS (
          SELECT 1 FROM ${this.schemaName}.trigger_registrations
          WHERE trigger_name = $1 AND input_hash = $2
        )`,
      [
        registration.triggerName,
        registration.inputHash,
        registration.targetType,
        registration.targetName,
      ]
    )
  }

  protected async getDistinctTriggerInputs(
    supportedTriggers: string[]
  ): Promise<TriggerInputInstance[]> {
    const result = await this.sql.unsafe(
      `SELECT DISTINCT r.trigger_name, r.input_hash, r.input_data
      FROM ${this.schemaName}.trigger_registrations r
      INNER JOIN ${this.schemaName}.trigger_registration_deployments d
        ON r.trigger_name = d.trigger_name AND r.input_hash = d.input_hash
      WHERE d.deployment_id = $1 AND r.trigger_name = ANY($2)`,
      [this.deploymentService.deploymentId, supportedTriggers]
    )

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
    const deploymentId = this.deploymentService.deploymentId

    // First try to insert (unclaimed case) or reclaim our own
    const result = await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.trigger_instances
        (trigger_name, input_hash, input_data, owner_deployment_id, claimed_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (trigger_name, input_hash)
      DO UPDATE SET
        owner_deployment_id = $4,
        claimed_at = NOW()
      WHERE ${this.schemaName}.trigger_instances.owner_deployment_id = $4
      RETURNING *`,
      [triggerName, inputHash, JSON.stringify(inputData), deploymentId]
    )

    if (result.length > 0) {
      return true
    }

    // Check if the current owner is still alive
    const existing = await this.sql.unsafe(
      `SELECT owner_deployment_id FROM ${this.schemaName}.trigger_instances
       WHERE trigger_name = $1 AND input_hash = $2`,
      [triggerName, inputHash]
    )

    if (existing.length === 0) {
      return false
    }

    const currentOwner = existing[0]!.owner_deployment_id as string
    const alive = await this.deploymentService.isDeploymentAlive(currentOwner)

    if (!alive) {
      // Owner is dead, take over
      const takeOver = await this.sql.unsafe(
        `UPDATE ${this.schemaName}.trigger_instances
         SET owner_deployment_id = $3, claimed_at = NOW()
         WHERE trigger_name = $1 AND input_hash = $2 AND owner_deployment_id = $4
         RETURNING *`,
        [triggerName, inputHash, deploymentId, currentOwner]
      )
      return takeOver.length > 0
    }

    return false
  }

  protected async releaseInstance(
    triggerName: string,
    inputHash: string
  ): Promise<void> {
    await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.trigger_instances
      WHERE trigger_name = $1 AND input_hash = $2 AND owner_deployment_id = $3`,
      [triggerName, inputHash, this.deploymentService.deploymentId]
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
      ownerDeploymentId: string
      claimedAt: Date
    }>
  > {
    const result = await this.sql.unsafe(
      `SELECT trigger_name, input_hash, owner_deployment_id, claimed_at
      FROM ${this.schemaName}.trigger_instances
      ORDER BY trigger_name, input_hash`
    )

    return result.map((row) => ({
      triggerName: row.trigger_name as string,
      inputHash: row.input_hash as string,
      ownerDeploymentId: row.owner_deployment_id as string,
      claimedAt: new Date(row.claimed_at as string),
    }))
  }
}
