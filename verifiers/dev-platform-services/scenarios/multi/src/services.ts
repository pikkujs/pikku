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

// Naming a service in the second parameter is what makes this project reach
// it: a service nothing reaches is not part of the dev build.
export const createSingletonServices = pikkuServices(
  async (
    config,
    { notifier, logger: baseLogger, cache, blob, events, noopQueue }
  ): Promise<RequiredSingletonServices> => {
    const variables = new LocalVariablesService()
    const secrets = new LocalSecretService(variables)
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)

    return {
      config,
      secrets,
      logger: baseLogger ?? logger,
      variables,
      schema,
      notifier,
      cache,
      blob,
      events,
      noopQueue,
    } as RequiredSingletonServices
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
