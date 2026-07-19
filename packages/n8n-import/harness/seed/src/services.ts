import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import {
  pikkuConfig,
  pikkuServices,
  pikkuWireServices,
} from '#pikku/pikku-types.gen.js'

export const createConfig = pikkuConfig(async () => {
  return {}
})

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const logger = new ConsoleLogger()
    const secrets = new LocalSecretService(variables)
    return {
      config,
      logger,
      variables,
      secrets,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
