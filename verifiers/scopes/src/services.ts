import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { InMemoryScopeService } from './scope-service.js'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

export const createConfig = pikkuConfig(async () => {
  return {}
})

export const createSingletonServices = pikkuServices(
  async (config, existingServices): Promise<RequiredSingletonServices> => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const secrets =
      existingServices?.secrets || new LocalSecretService(variables)
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)
    const scopeService = new InMemoryScopeService()

    return {
      config,
      secrets,
      logger,
      variables,
      schema,
      scopeService,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
