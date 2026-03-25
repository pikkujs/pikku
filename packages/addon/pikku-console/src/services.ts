import { pikkuAddonServices } from '#pikku'
import { pikkuState } from '@pikku/core/internal'
import { WiringService } from './services/wiring.service.js'
import { AddonService } from './services/addon.service.js'
import { SchemaService } from './services/schema.service.js'
import { OAuthService } from './services/oauth.service.js'
import { FileWatcherService } from './services/file-watcher.service.js'

export const createSingletonServices = pikkuAddonServices(
  async (
    _config,
    {
      variables,
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
    const pikkuMetaPath = pikkuState(null, 'package', 'metaDir') ?? ''
    const registryUrl =
      (await variables.get('REGISTRY_URL')) ?? 'https://pikku-registry.fly.dev'

    const wiringService = new WiringService(pikkuMetaPath)
    const schemaService = new SchemaService(pikkuMetaPath)
    const addonService = new AddonService(registryUrl)
    await addonService.init()
    const oauthService = new OAuthService()
    const fileWatcherService = new FileWatcherService(
      pikkuMetaPath,
      wiringService,
      schemaService
    )
    fileWatcherService.start()

    return {
      wiringService,
      addonService,
      schemaService,
      oauthService,
      fileWatcherService,
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
