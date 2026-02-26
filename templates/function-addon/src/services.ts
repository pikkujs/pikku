import { pikkuServices } from '#pikku'
import {
  ConsoleLogger,
  LocalVariablesService,
  LocalSecretService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { RequiredSingletonServices } from '../.pikku/pikku-services.gen.js'
import { NoopService } from './services/noop-service.js'

export const createSingletonServices = pikkuServices(
  async (config, existingServices): Promise<RequiredSingletonServices> => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const logger = existingServices?.logger || new ConsoleLogger()
    const schema = existingServices?.schema || new CFWorkerSchemaService(logger)
    const secrets =
      existingServices?.secrets || new LocalSecretService(variables)

    return {
      config,
      logger,
      variables,
      schema,
      secrets,
      noop: new NoopService(),
    }
  }
)
