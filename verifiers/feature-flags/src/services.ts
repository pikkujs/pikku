import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { InMemoryFeatureFlagStore } from './flag-store.js'
import { UnusedScopeService } from './scope-service.js'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

export const featureFlags = new InMemoryFeatureFlagStore({ ttlMs: 0 })

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

    return {
      config,
      secrets,
      logger,
      variables,
      schema,
      scopeService: new UnusedScopeService(),
      featureFlags,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
