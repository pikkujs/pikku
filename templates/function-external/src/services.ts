import type { Config, SingletonServices } from '../types/application-types.d.js'
import { CreateSingletonServices } from '@pikku/core'
import {
  ConsoleLogger,
  LocalVariablesService,
  LocalSecretService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { RequiredSingletonServices } from '../.pikku/pikku-services.gen.js'
import { NoopService } from './services/noop-service.js'

export const createSingletonServices: CreateSingletonServices<
  Config,
  RequiredSingletonServices
> = async (
  config: Config,
  existingServices?: Partial<SingletonServices>
): Promise<RequiredSingletonServices> => {
  const variables = existingServices?.variables || new LocalVariablesService()
  const logger = existingServices?.logger || new ConsoleLogger()
  const schema = existingServices?.schema || new CFWorkerSchemaService(logger)
  const secrets = existingServices?.secrets || new LocalSecretService(variables)

  return {
    config,
    logger,
    variables,
    schema,
    secrets,
    noop: new NoopService(),
  }
}
