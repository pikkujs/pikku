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
  return {}
})

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
    }
  }
)

export const createWireServices = pikkuWireServices(
  async (_singletonServices, _session) => {
    return {}
  }
)
