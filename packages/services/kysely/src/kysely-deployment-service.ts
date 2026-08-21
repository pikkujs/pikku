import { buildRemoteHeaders } from '@pikku/core/remote'
import type {
  DeploymentService,
  DeploymentServiceConfig,
  DeploymentConfig,
} from '@pikku/core/services'
import type { JWTService } from '@pikku/core/services'
import type { SecretService } from '@pikku/core/services'
import { getAllFunctionNames } from '@pikku/core/function'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { requirePikkuSchema } from './schema/index.js'
import { deploymentSchema } from './schema/deployment.schema.js'

export class KyselyDeploymentService implements DeploymentService {
  private initialized = false
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private deploymentConfig?: DeploymentConfig
  private heartbeatInterval: number
  private heartbeatTtl: number

  constructor(
    config: DeploymentServiceConfig,
    protected db: Kysely<KyselyPikkuDB>,
    private jwt?: JWTService,
    private secrets?: SecretService
  ) {
    this.heartbeatInterval = config.heartbeatInterval ?? 10000
    this.heartbeatTtl = config.heartbeatTtl ?? 30000
  }

  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, deploymentSchema)
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

  async invoke(
    funcName: string,
    data: unknown,
    session?: unknown,
    traceId?: string
  ): Promise<unknown> {
    const headers = await buildRemoteHeaders(
      this.jwt,
      this.secrets,
      funcName,
      session,
      traceId
    )
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
      body: JSON.stringify({ data }),
    })

    if (!response.ok) {
      throw new Error(
        `Remote RPC call to '${funcName}' failed: ${response.status}`
      )
    }

    return response.json()
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
