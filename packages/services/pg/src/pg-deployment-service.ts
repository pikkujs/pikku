import type {
  DeploymentService,
  DeploymentServiceConfig,
  DeploymentConfig,
  DeploymentInfo,
} from '@pikku/core/services'
import { getAllFunctionNames } from '@pikku/core/function'
import postgres from 'postgres'

export class PgDeploymentService implements DeploymentService {
  private sql: postgres.Sql
  private schemaName: string
  private initialized = false
  private ownsConnection: boolean
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private deploymentConfig?: DeploymentConfig
  private heartbeatInterval: number
  private heartbeatTtl: number

  constructor(
    config: DeploymentServiceConfig,
    connectionOrConfig: postgres.Sql | postgres.Options<{}>,
    schemaName = 'pikku'
  ) {
    this.heartbeatInterval = config.heartbeatInterval ?? 10000
    this.heartbeatTtl = config.heartbeatTtl ?? 30000
    this.schemaName = schemaName

    if (typeof connectionOrConfig === 'function') {
      this.sql = connectionOrConfig as postgres.Sql
      this.ownsConnection = false
    } else {
      this.sql = postgres(connectionOrConfig)
      this.ownsConnection = true
    }
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.createSchema()
    this.initialized = true
  }

  private async createSchema(): Promise<void> {
    await this.sql.unsafe(`
      DO $$
      BEGIN
        CREATE SCHEMA ${this.schemaName};
      EXCEPTION WHEN duplicate_schema OR unique_violation THEN
        NULL;
      END
      $$;

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.pikku_deployments (
        deployment_id TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        functions TEXT[] NOT NULL,
        last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_pikku_deployments_functions
        ON ${this.schemaName}.pikku_deployments USING GIN (functions);

      CREATE INDEX IF NOT EXISTS idx_pikku_deployments_heartbeat
        ON ${this.schemaName}.pikku_deployments (last_heartbeat);
    `)
  }

  async start(config: DeploymentConfig): Promise<void> {
    const functions = config.functions ?? getAllFunctionNames()
    this.deploymentConfig = { ...config, functions }

    await this.sql`
      INSERT INTO ${this.sql(this.schemaName)}.pikku_deployments
        (deployment_id, endpoint, functions, last_heartbeat)
      VALUES (${config.deploymentId}, ${config.endpoint}, ${functions}, now())
      ON CONFLICT (deployment_id)
      DO UPDATE SET
        endpoint = EXCLUDED.endpoint,
        functions = EXCLUDED.functions,
        last_heartbeat = now()
    `

    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.heartbeatInterval
    )
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }

    if (this.deploymentConfig) {
      await this.sql`
        DELETE FROM ${this.sql(this.schemaName)}.pikku_deployments
        WHERE deployment_id = ${this.deploymentConfig.deploymentId}
      `
    }

    if (this.ownsConnection) {
      await this.sql.end()
    }
  }

  async findFunction(name: string): Promise<DeploymentInfo[]> {
    const ttlSeconds = this.heartbeatTtl / 1000
    const result = await this.sql<
      { deployment_id: string; endpoint: string }[]
    >`
      SELECT deployment_id, endpoint
      FROM ${this.sql(this.schemaName)}.pikku_deployments
      WHERE ${name} = ANY(functions)
        AND last_heartbeat > now() - interval '${this.sql.unsafe(String(ttlSeconds))} seconds'
      ORDER BY last_heartbeat DESC
    `

    return result.map((row) => ({
      deploymentId: row.deployment_id,
      endpoint: row.endpoint,
    }))
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.deploymentConfig) return

    try {
      await this.sql`
        UPDATE ${this.sql(this.schemaName)}.pikku_deployments
        SET last_heartbeat = now()
        WHERE deployment_id = ${this.deploymentConfig.deploymentId}
      `
    } catch {
      // Heartbeat failed, will retry on next interval
    }
  }
}
