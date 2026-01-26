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
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

export const createConfig: CreateConfig<Config> = async () => {
  return {}
}

export const createSingletonServices: CreateSingletonServices<
  Config,
  RequiredSingletonServices
> = async (
  config: Config,
  existingServices?: Partial<SingletonServices>
): Promise<RequiredSingletonServices> => {
  const variables = existingServices?.variables || new LocalVariablesService()
  const secrets = existingServices?.secrets || new LocalSecretService(variables)
  const logger = new ConsoleLogger()
  const schema = new CFWorkerSchemaService(logger)

  return {
    config,
    secrets,
    logger,
    variables,
    schema,
  }
}

export const createWireServices: CreateWireServices<
  SingletonServices,
  Services,
  UserSession
> = async () => {
  return {}
}
