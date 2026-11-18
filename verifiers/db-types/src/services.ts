import { pikkuConfig, pikkuServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'

export const createConfig = pikkuConfig(async () => ({}))

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const variables = existingServices?.variables ?? new LocalVariablesService()
    const secrets =
      existingServices?.secrets ?? new LocalSecretService(variables)
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)
    const kysely = existingServices?.kysely
    if (!kysely) throw new Error('This app needs the kysely its host opens.')

    return { config, secrets, logger, variables, schema, kysely }
  }
)
