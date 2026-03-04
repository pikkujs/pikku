import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import {
  pikkuConfig,
  pikkuServices,
  pikkuWireServices,
} from '../.pikku/pikku-types.gen.js'
import { TodoStore } from './services/store.service.js'

export const createConfig = pikkuConfig(async () => {
  return {
    awsRegion: 'us-east-1',
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

    return {
      config,
      logger,
      variables,
      schema,
      secrets,
      todoStore: existingServices?.todoStore || new TodoStore(),
      aiStorage: existingServices?.aiStorage,
      aiAgentRunner: existingServices?.aiAgentRunner,
      aiRunState: existingServices?.aiRunState,
      eventHub: existingServices?.eventHub,
      workflowService: existingServices?.workflowService,
      queueService: existingServices?.queueService,
      schedulerService: existingServices?.schedulerService,
      deploymentService: existingServices?.deploymentService,
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
