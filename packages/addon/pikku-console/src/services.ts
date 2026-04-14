import { pikkuAddonServices } from '#pikku'
import { WiringService } from './services/wiring.service.js'
import { AddonService } from './services/addon.service.js'
import { OAuthService } from './services/oauth.service.js'
import type { CodeEditService } from './services/code-edit.service.js'
import { dirname } from 'node:path'

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
    if (metaBasePath) {
      const codeEditPath = './services/code-edit.service.js'
      const { CodeEditService } = await import(codeEditPath)
      codeEditService = new CodeEditService(dirname(metaBasePath))
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
    }
  }
)
