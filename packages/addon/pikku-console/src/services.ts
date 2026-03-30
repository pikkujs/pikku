import { pikkuAddonServices } from '#pikku'
import { LocalMetaService } from '@pikku/core/services/local-meta'
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
    const metaService = existingMetaService ?? new LocalMetaService()
    const registryUrl =
      (await variables.get('REGISTRY_URL')) ?? 'https://pikku-registry.fly.dev'

    const wiringService = new WiringService(metaService)
    const schemaService = new SchemaService(metaService)
    const addonService = new AddonService(registryUrl)
    await addonService.init()
    const oauthService = new OAuthService()

    // FileWatcher only works on Node.js (needs filesystem + fs.watch)
    let fileWatcherService: FileWatcherService | undefined
    if (metaService instanceof LocalMetaService) {
      fileWatcherService = new FileWatcherService(
        metaService.basePath,
        wiringService,
        schemaService
      )
      fileWatcherService.start()
    }

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
