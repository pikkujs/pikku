import type {
  Config,
  Services,
  SingletonServices,
  UserSession,
} from '../types/application-types.d.js'
import {
  CreateConfig,
  CreateWireServices,
  CreateSingletonServices,
} from '@pikku/core'
import {
  LocalSecretService,
  LocalVariablesService,
  ConsoleLogger,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'

export const createConfig: CreateConfig<Config> = async () => {
  return {}
}

export const createSingletonServices: CreateSingletonServices<
  Config,
  SingletonServices
> = async (
  config: Config,
  existingServices?: Partial<SingletonServices>
): Promise<SingletonServices> => {
  const variables = existingServices?.variables || new LocalVariablesService()
  const secrets = existingServices?.secrets || new LocalSecretService(variables)
  const logger = existingServices?.logger || new ConsoleLogger()
  const schema = new CFWorkerSchemaService(logger)

  return {
    config,
    logger,
    variables,
    secrets,
    schema,
    deploymentService: existingServices?.deploymentService,
  }
}

export const createWireServices: CreateWireServices<
  SingletonServices,
  Services,
  UserSession
> = async (_singletonServices, _session) => {
  return {}
}
