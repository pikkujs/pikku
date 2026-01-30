import { DeploymentService } from '@pikku/core'
import postgres from 'postgres'

/**
 * PostgreSQL-based implementation of DeploymentService.
 *
 * Tracks live deployments in a `deployments` table with heartbeat timestamps.
 *
 * @example
 * ```typescript
 * const sql = postgres('postgresql://localhost:5432/pikku')
 * const deploymentService = new PgDeploymentService(sql, 'pikku')
 * await deploymentService.init()
 * await deploymentService.start()
 * ```
 */
export class PgDeploymentService extends DeploymentService {
  private sql: postgres.Sql
  private schemaName: string
  private ownsConnection: boolean
  private initialized = false
  private heartbeatTimeoutSeconds: number

  /**
   * @param connectionOrConfig - postgres.Sql connection instance or postgres.Options config
   * @param schemaName - PostgreSQL schema name (default: 'pikku')
   * @param heartbeatTimeoutSeconds - Seconds before a deployment is considered dead (default: 30)
   */
  constructor(
    connectionOrConfig: postgres.Sql | postgres.Options<{}>,
    schemaName = 'pikku',
    heartbeatTimeoutSeconds = 30
  ) {
    super()
    this.schemaName = schemaName
    this.heartbeatTimeoutSeconds = heartbeatTimeoutSeconds

    if (typeof connectionOrConfig === 'function') {
      this.sql = connectionOrConfig as postgres.Sql
      this.ownsConnection = false
    } else {
      this.sql = postgres(connectionOrConfig)
      this.ownsConnection = true
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return

    await this.sql.unsafe(`
      CREATE SCHEMA IF NOT EXISTS ${this.schemaName};

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.deployments (
        deployment_id VARCHAR PRIMARY KEY,
        heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    this.initialized = true
  }

  protected async registerProcess(): Promise<void> {
    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.deployments (deployment_id, heartbeat_at)
       VALUES ($1, NOW())
       ON CONFLICT (deployment_id) DO UPDATE SET heartbeat_at = NOW()`,
      [this.deploymentId]
    )
  }

  protected async unregisterProcess(): Promise<void> {
    await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.deployments WHERE deployment_id = $1`,
      [this.deploymentId]
    )
  }

  protected async updateHeartbeat(): Promise<void> {
    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.deployments SET heartbeat_at = NOW() WHERE deployment_id = $1`,
      [this.deploymentId]
    )
  }

  async isProcessAlive(deploymentId: string): Promise<boolean> {
    const result = await this.sql.unsafe(
      `SELECT 1 FROM ${this.schemaName}.deployments
       WHERE deployment_id = $1
         AND heartbeat_at > NOW() - INTERVAL '${this.heartbeatTimeoutSeconds} seconds'`,
      [deploymentId]
    )
    return result.length > 0
  }

  async getAliveDeploymentIds(): Promise<string[]> {
    const result = await this.sql.unsafe(
      `SELECT deployment_id FROM ${this.schemaName}.deployments
       WHERE heartbeat_at > NOW() - INTERVAL '${this.heartbeatTimeoutSeconds} seconds'`
    )
    return result.map((row) => row.deployment_id as string)
  }

  /**
   * Remove expired deployments from the table
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.deployments
       WHERE heartbeat_at < NOW() - INTERVAL '${this.heartbeatTimeoutSeconds} seconds'
       RETURNING *`
    )
    return result.length
  }

  /**
   * Close the database connection if we own it
   */
  async close(): Promise<void> {
    await this.stop()
    if (this.ownsConnection) {
      await this.sql.end()
    }
  }
}
