import { pikkuAddonServices } from '#pikku'
import { WiringService } from './services/wiring.service.js'
import { AddonService } from './services/addon.service.js'
import { OAuthService } from './services/oauth.service.js'

export const createSingletonServices = pikkuAddonServices(
  async (
    _config,
    {
      variables,
      metaService: existingMetaService,
      aiAgentRunner,
      schedulerService,
      agentRunService,
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

    return {
      metaService,
      wiringService,
      addonService,
      oauthService,
      workflowRunService,
      agentRunService,
      aiStorage,
      aiRunState,
      deploymentService,
      aiAgentRunner,
      schedulerService,
      credentialService,
    }
  }
)
