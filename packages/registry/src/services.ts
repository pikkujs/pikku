import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { pikkuServices, pikkuWireServices } from '#pikku/pikku-types.gen.js'

import { JsonFileStorage } from './services/storage/json-file.storage.js'
import { IngestionService } from './services/ingestion.service.js'
import { RegistryService } from './services/registry.service.js'
import { join } from 'path'

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const logger = new ConsoleLogger()

    const variables = existingServices?.variables ?? new LocalVariablesService()
    const secrets =
      existingServices?.secrets ?? new LocalSecretService(variables)
    const schema = new CFWorkerSchemaService(logger)

    const dataDir =
      process.env.DATA_DIR ?? join(process.cwd(), 'data', 'packages')
    const storage = new JsonFileStorage(dataDir)
    await storage.init()

    const ingestionService = new IngestionService()
    const registryService = new RegistryService(storage, ingestionService)

    return {
      config,
      variables,
      secrets,
      schema,
      logger,
      registryService,
    }
  }
)

export const createSessionServices = pikkuWireServices(async () => {
  return {}
})
