import type {
  DeploymentService,
  DeploymentServiceConfig,
  DeploymentConfig,
  DeploymentInfo,
} from '@pikku/core/services'
import { getAllFunctionNames } from '@pikku/core/function'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'

export class KyselyDeploymentService implements DeploymentService {
  private initialized = false
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private deploymentConfig?: DeploymentConfig
  private heartbeatInterval: number
  private heartbeatTtl: number

  constructor(
    config: DeploymentServiceConfig,
    private db: Kysely<KyselyPikkuDB>
  ) {
    this.heartbeatInterval = config.heartbeatInterval ?? 10000
    this.heartbeatTtl = config.heartbeatTtl ?? 30000
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.db.schema
      .createTable('pikku_deployments')
      .ifNotExists()
      .addColumn('deployment_id', 'text', (col) => col.primaryKey())
      .addColumn('endpoint', 'text', (col) => col.notNull())
      .addColumn('last_heartbeat', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    await this.db.schema
      .createTable('pikku_deployment_functions')
      .ifNotExists()
      .addColumn('deployment_id', 'text', (col) =>
        col
          .notNull()
          .references('pikku_deployments.deployment_id')
          .onDelete('cascade')
      )
      .addColumn('function_name', 'text', (col) => col.notNull())
      .addPrimaryKeyConstraint('pikku_deployment_functions_pk', [
        'deployment_id',
        'function_name',
      ])
      .execute()

    await this.db.schema
      .createIndex('idx_pikku_deployments_heartbeat')
      .ifNotExists()
      .on('pikku_deployments')
      .column('last_heartbeat')
      .execute()

    await this.db.schema
      .createIndex('idx_pikku_deployment_functions_name')
      .ifNotExists()
      .on('pikku_deployment_functions')
      .column('function_name')
      .execute()

    this.initialized = true
  }

  async start(config: DeploymentConfig): Promise<void> {
    const functions = config.functions ?? getAllFunctionNames()
    this.deploymentConfig = { ...config, functions }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('pikku_deployments')
        .values({
          deployment_id: config.deploymentId,
          endpoint: config.endpoint,
          last_heartbeat: new Date(),
        })
        .onConflict((oc) =>
          oc.column('deployment_id').doUpdateSet({
            endpoint: config.endpoint,
            last_heartbeat: new Date(),
          })
        )
        .execute()

      await trx
        .deleteFrom('pikku_deployment_functions')
        .where('deployment_id', '=', config.deploymentId)
        .execute()

      if (functions.length > 0) {
        await trx
          .insertInto('pikku_deployment_functions')
          .values(
            functions.map((fn) => ({
              deployment_id: config.deploymentId,
              function_name: fn,
            }))
          )
          .execute()
      }
    })

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
      await this.db
        .deleteFrom('pikku_deployments')
        .where('deployment_id', '=', this.deploymentConfig.deploymentId)
        .execute()
    }
  }

  async findFunction(name: string): Promise<DeploymentInfo[]> {
    const ttlMs = this.heartbeatTtl
    const cutoff = new Date(Date.now() - ttlMs)

    const result = await this.db
      .selectFrom('pikku_deployments as d')
      .innerJoin(
        'pikku_deployment_functions as f',
        'f.deployment_id',
        'd.deployment_id'
      )
      .select(['d.deployment_id', 'd.endpoint'])
      .where('f.function_name', '=', name)
      .where('d.last_heartbeat', '>', cutoff)
      .orderBy('d.last_heartbeat', 'desc')
      .execute()

    return result.map((row) => ({
      deploymentId: row.deployment_id,
      endpoint: row.endpoint,
    }))
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.deploymentConfig) return

    try {
      await this.db
        .updateTable('pikku_deployments')
        .set({ last_heartbeat: new Date() })
        .where('deployment_id', '=', this.deploymentConfig.deploymentId)
        .execute()
    } catch {
      // Heartbeat failed, will retry on next interval
    }
  }
}
