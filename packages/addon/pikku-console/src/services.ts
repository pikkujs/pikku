import { pikkuAddonServices } from '#pikku'
import { WiringService } from './services/wiring.service.js'
import { AddonService } from './services/addon.service.js'
import type { CodeEditService } from './services/code-edit.service.js'
import { StateDiffService } from './services/state-diff.service.js'
import { DbSchemaService } from './services/db-schema.service.js'
import { findProjectRoot } from './lib/find-project-root.js'

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
      coverageService,
      scopeService,
      webhookService,
    }
  ) => {
    if (!existingMetaService) {
      throw new Error(
        'metaService is required for the console addon. Set it in your createSingletonServices using PikkuMetaService from #pikku/pikku-meta-service.gen.js'
      )
    }
    const metaService = existingMetaService
    const fabricApiUrl =
      (await variables.get('FABRIC_API_URL')) ?? 'https://api.pikkufabric.com'

    const wiringService = new WiringService(metaService)
    const addonService = new AddonService(fabricApiUrl)
    await addonService.init()

    const metaBasePath = existingMetaService?.basePath
    let codeEditService: CodeEditService | null = null
    let stateDiffService: StateDiffService | null = null
    let dbSchemaService: DbSchemaService | null = null
    if (metaBasePath) {
      const projectRoot = findProjectRoot(metaBasePath)
      stateDiffService = new StateDiffService(projectRoot)
      dbSchemaService = new DbSchemaService(metaService)
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
      addonService,
      workflowService,
      workflowRunService,
      agentRunService,
      aiStorage,
      aiRunState,
      deploymentService,
      aiAgentRunner,
      schedulerService,
      credentialService,
      coverageService,
      scopeService,
      webhookService,
      codeEditService,
      stateDiffService,
      dbSchemaService,
    }
  }
)
