import { AbstractDeploymentService } from '@pikku/core/services'
import type {
  DeploymentServiceConfig,
  DeploymentConfig,
} from '@pikku/core/services'
import type { JWTService, SecretService } from '@pikku/core/services'
import { getAllFunctionNames } from '@pikku/core/function'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'

export class KyselyDeploymentService extends AbstractDeploymentService {
  private initialized = false
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private deploymentConfig?: DeploymentConfig
  private heartbeatInterval: number
  private heartbeatTtl: number

  constructor(
    config: DeploymentServiceConfig,
    protected db: Kysely<KyselyPikkuDB>,
    jwt?: JWTService,
    secrets?: SecretService
  ) {
    super(jwt, secrets)
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

    await this.createIndexSafe(
      this.db.schema
        .createIndex('idx_pikku_deployments_heartbeat')
        .ifNotExists()
        .on('pikku_deployments')
        .column('last_heartbeat')
    )

    await this.createIndexSafe(
      this.db.schema
        .createIndex('idx_pikku_deployment_functions_name')
        .ifNotExists()
        .on('pikku_deployment_functions')
        .column('function_name')
    )

    this.initialized = true
  }

  async start(config: DeploymentConfig): Promise<void> {
    const functions = config.functions ?? getAllFunctionNames()
    this.deploymentConfig = { ...config, functions }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('pikkuDeployments')
        .values({
          deploymentId: config.deploymentId,
          endpoint: config.endpoint,
          lastHeartbeat: new Date(),
        })
        .onConflict((oc) =>
          oc.column('deploymentId').doUpdateSet({
            endpoint: config.endpoint,
            lastHeartbeat: new Date(),
          })
        )
        .execute()

      await trx
        .deleteFrom('pikkuDeploymentFunctions')
        .where('deploymentId', '=', config.deploymentId)
        .execute()

      if (functions.length > 0) {
        await trx
          .insertInto('pikkuDeploymentFunctions')
          .values(
            functions.map((fn) => ({
              deploymentId: config.deploymentId,
              functionName: fn,
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
        .deleteFrom('pikkuDeployments')
        .where('deploymentId', '=', this.deploymentConfig.deploymentId)
        .execute()
    }
  }

  protected async dispatch(
    funcName: string,
    data: unknown,
    headers: Record<string, string>
  ): Promise<unknown> {
    const ttlMs = this.heartbeatTtl
    const cutoff = new Date(Date.now() - ttlMs)

    const result = await this.db
      .selectFrom('pikkuDeployments as d')
      .innerJoin(
        'pikkuDeploymentFunctions as f',
        'f.deploymentId',
        'd.deploymentId'
      )
      .select(['d.deploymentId', 'd.endpoint'])
      .where('f.functionName', '=', funcName)
      .where('d.lastHeartbeat', '>', cutoff)
      .orderBy('d.lastHeartbeat', 'desc')
      .limit(1)
      .execute()

    if (result.length === 0) {
      throw new Error(`No deployment found for function '${funcName}'`)
    }

    const endpoint = result[0].endpoint
    const url = `${endpoint}/remote/rpc/${encodeURIComponent(funcName)}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error(
        `Remote RPC call to '${funcName}' failed: ${response.status}`
      )
    }

    return response.json()
  }

  private async createIndexSafe(builder: {
    execute(): Promise<void>
  }): Promise<void> {
    try {
      await builder.execute()
    } catch (e: any) {
      if (e?.code === 'ER_DUP_KEYNAME' || e?.errno === 1061) return
      if (e?.code === '42P07') return
      if (e?.message?.includes('already exists')) return
      throw e
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.deploymentConfig) return

    try {
      await this.db
        .updateTable('pikkuDeployments')
        .set({ lastHeartbeat: new Date() })
        .where('deploymentId', '=', this.deploymentConfig.deploymentId)
        .execute()
    } catch {
      // Heartbeat failed, will retry on next interval
    }
  }
}
