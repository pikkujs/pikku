import { pikkuAddonServices } from '#pikku/addon/setup'
import { WiringService } from './services/wiring.service.js'
import { AddonService } from './services/addon.service.js'
import { AddonReadinessService } from './services/addon-readiness.service.js'
import type { CodeEditService } from './services/code-edit.service.js'
import { StateDiffService } from './services/state-diff.service.js'
import { DbSchemaService } from './services/db-schema.service.js'
import { KnowledgeService } from './services/knowledge.service.js'
import { SecretAdminService } from './services/secret-admin.service.js'
import { findProjectRoot } from './lib/find-project-root.js'
import { join } from 'node:path'
import { FileScenarioRunStore } from '@pikku/core/services'

export const createSingletonServices = pikkuAddonServices(
  async (
    _config,
    {
      variables,
      secrets,
      metaService: existingMetaService,
      agentRunner,
      schedulerService,
      agentRunService,
      workflowService,
      workflowRunService,
      agentStorage,
      agentRunState,
      deploymentService,
      credentialService,
      coverageService,
      webhookService,
      auth,
    }
  ) => {
    if (!existingMetaService) {
      throw new Error(
        'metaService is required for the console addon. Set it in your createSingletonServices using PikkuMetaService from #pikku/services/pikku-meta-service.gen.js'
      )
    }
    const metaService = existingMetaService
    const fabricApiUrl =
      (await variables.get('FABRIC_API_URL')) ?? 'https://api.pikkufabric.com'

    const wiringService = new WiringService(metaService)
    const secretAdminService = new SecretAdminService(secrets)
    const addonService = new AddonService(fabricApiUrl)
    await addonService.init()
    const addonReadinessService = new AddonReadinessService(secrets, variables)

    const metaBasePath = existingMetaService?.basePath
    let codeEditService: CodeEditService | null = null
    let stateDiffService: StateDiffService | null = null
    let dbSchemaService: DbSchemaService | null = null
    let knowledgeService: KnowledgeService | null = null
    let scenarioRunStore: FileScenarioRunStore | null = null
    if (metaBasePath) {
      const projectRoot = findProjectRoot(metaBasePath)
      stateDiffService = new StateDiffService(projectRoot)
      dbSchemaService = new DbSchemaService(metaService)
      knowledgeService = new KnowledgeService(projectRoot, metaBasePath)
      // The same directory `pikku scenario run` writes to: the console reads
      // runs the CLI recorded, so the path is the contract between them.
      scenarioRunStore = new FileScenarioRunStore({
        dir: join(metaBasePath, 'scenario-runs'),
      })
      // code-edit.service pulls in the TypeScript compiler and is deliberately a
      // lazy, separately-bundled module. Self-contained bundles (e.g. the sandbox
      // orchestrator standalone artifact) don't ship it, so a failed import must
      // degrade to a null codeEditService — never crash every console RPC. The
      // update-* edit functions already guard on `if (!codeEditService) throw`.
      try {
        const codeEditPath = './services/code-edit.service.js'
        const { CodeEditService } = await import(codeEditPath)
        codeEditService = new CodeEditService(projectRoot)
      } catch {
        // codeEditService stays null; write-time edit ops report it unavailable.
      }
    }

    return {
      metaService,
      wiringService,
      secretAdminService,
      addonService,
      addonReadinessService,
      workflowService,
      workflowRunService,
      agentRunService,
      agentStorage,
      agentRunState,
      deploymentService,
      agentRunner,
      schedulerService,
      credentialService,
      coverageService,
      webhookService,
      codeEditService,
      stateDiffService,
      dbSchemaService,
      knowledgeService,
      scenarioRunStore,
      auth,
    }
  }
)
