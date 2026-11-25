import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

export const createConfig = pikkuConfig(async () => {
  return {}
})

// Checks existingServices.kysely and spreads existingServices.
export const createSingletonServices = pikkuServices(
  async (config, existingServices): Promise<RequiredSingletonServices> => {
    const { aiProviders, analyticsSinks } = existingServices
    const kysely = existingServices.kysely ?? { driver: 'own' }
    const variables = new LocalVariablesService()
    const secrets = new LocalSecretService(variables)
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)

    return {
      ...existingServices,
      config,
      secrets,
      logger,
      variables,
      schema,
      kysely,
      aiProviders,
      analyticsSinks,
    } as unknown as RequiredSingletonServices
  }
)

// A per-request factory that shadows nothing.
export const createWireServices = pikkuWireServices(async () => ({}))
