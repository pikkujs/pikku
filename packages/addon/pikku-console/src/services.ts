import { pikkuAddonServices } from '#pikku'
import { WiringService } from './services/wiring.service.js'
import { AddonService } from './services/addon.service.js'
import { OAuthService } from './services/oauth.service.js'
import type { CodeEditService } from './services/code-edit.service.js'
import { StateDiffService } from './services/state-diff.service.js'
import {
  DbSchemaService,
  type OpenDbFn,
  type PgPoolCtor,
} from './services/db-schema.service.js'

export const createSingletonServices = pikkuAddonServices(
  async (
    _config,
    {
      variables,
      metaService: existingMetaService,
      aiAgentRunner,
      schedulerService,
      agentRunService,
      workflowService,
      workflowRunService,
      aiStorage,
      aiRunState,
      deploymentService,
      credentialService,
    }
  ) => {
    if (!existingMetaService) {
      throw new Error(
        'metaService is required for the console addon. Set it in your createSingletonServices using PikkuMetaService from #pikku/pikku-meta-service.gen.js'
      )
    }
    const metaService = existingMetaService
    const registryUrl =
      (await variables.get('REGISTRY_URL')) ?? 'https://pikku-registry.fly.dev'

    const wiringService = new WiringService(metaService)
    const addonService = new AddonService(registryUrl)
    await addonService.init()
    const oauthService = new OAuthService()

    const metaBasePath = existingMetaService?.basePath
    let codeEditService: CodeEditService | null = null
    let stateDiffService: StateDiffService | null = null
    let dbSchemaService: DbSchemaService | null = null
    if (metaBasePath) {
      const { dirname } = await import('node:path')
      const codeEditPath = './services/code-edit.service.js'
      const { CodeEditService } = await import(codeEditPath)
      const projectRoot = dirname(metaBasePath)
      codeEditService = new CodeEditService(projectRoot)
      stateDiffService = new StateDiffService(projectRoot)

      let openDb: OpenDbFn | null = null
      let PgPool: PgPoolCtor | null = null

      try {
        // node:sqlite is built into Node 22+; cast to any to avoid missing @types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sqliteMod: any = await import('node:sqlite' as string)
        openDb = (filename) => new sqliteMod.DatabaseSync(filename)
      } catch {
        // Node < 22 — SQLite unavailable
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pgMod: any = await import('pg' as string)
        PgPool = pgMod.Pool ?? pgMod.default?.Pool ?? null
      } catch {
        // pg not installed — Postgres unavailable
      }

      dbSchemaService = new DbSchemaService(
        projectRoot,
        openDb,
        PgPool,
        metaService
      )
    }

    return {
      metaService,
      wiringService,
      addonService,
      oauthService,
      workflowService,
      workflowRunService,
      agentRunService,
      aiStorage,
      aiRunState,
      deploymentService,
      aiAgentRunner,
      schedulerService,
      credentialService,
      codeEditService,
      stateDiffService,
      dbSchemaService,
    }
  }
)
