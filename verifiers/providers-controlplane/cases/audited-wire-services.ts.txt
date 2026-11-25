// The audited-kysely-per-request example from the docs: test.sh swaps it in for src/services.ts.
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

// Builds an audited kysely per request when singletonServices.audit exists.
// A per-request kysely shadows the singleton one: PKU393, documented as expected.
export const createWireServices = pikkuWireServices(
  async (singletonServices) => {
    if (!(singletonServices as { audit?: unknown }).audit) return {}
    return { kysely: { driver: 'audited' } as never }
  }
)
