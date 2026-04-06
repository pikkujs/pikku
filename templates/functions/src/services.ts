import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { JoseJWTService } from '@pikku/jose'
import {
  pikkuConfig,
  pikkuServices,
  pikkuWireServices,
} from '../.pikku/pikku-types.gen.js'
import { TodoStore } from './services/store.service.js'
import { requiredSingletonServices } from '../.pikku/pikku-services.gen.js'

export const createConfig = pikkuConfig(async () => {
  return {
    awsRegion: 'us-east-1',
    secrets: {
      AUTH_SECRET: 'AUTH_SECRET',
    },
  }
})

/**
 * Creates singleton services for the todo app.
 */
export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)
    const secrets = new LocalSecretService(variables)

    let metaService = existingServices?.metaService
    if (requiredSingletonServices.metaService) {
      if (!metaService) {
        const { PikkuMetaService } = await import(
          '../.pikku/pikku-meta-service.gen.js'
        )
        metaService = new PikkuMetaService()
      }
    }

    const jwt = new JoseJWTService()

    return {
      config,
      logger,
      variables,
      schema,
      secrets,
      jwt,
      todoStore: existingServices?.todoStore || new TodoStore(),
      aiStorage: existingServices?.aiStorage,
      aiAgentRunner: existingServices?.aiAgentRunner,
      aiRunState: existingServices?.aiRunState,
      eventHub: existingServices?.eventHub,
      workflowService: existingServices?.workflowService,
      queueService: existingServices?.queueService,
      schedulerService: existingServices?.schedulerService,
      deploymentService: existingServices?.deploymentService,
      metaService,
    }
  }
)

/**
 * Creates per-request wire services.
 */
export const createWireServices = pikkuWireServices(
  async (_singletonServices, _session) => {
    return {}
  }
)
