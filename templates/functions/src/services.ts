import type {
  Config,
  Services,
  SingletonServices,
  UserSession,
} from '../types/application-types.js'
import {
  CreateConfig,
  CreateSessionServices,
  CreateSingletonServices,
} from '@pikku/core'
import { ConsoleLogger, LocalVariablesService } from '@pikku/core/services'
import { PikkuHTTPSessionService } from '@pikku/core/http'
import { JoseJWTService } from '@pikku/jose'
import { AjvSchemaService } from '@pikku/schema-ajv'

export const createConfig: CreateConfig<Config> = async () => {
  return {}
}

/**
 * This function creates the singleton services used by the application and is created once on start.
 * It's important to use the types here, as the pikku CLI uses them to improve the development experience!
 */
export const createSingletonServices: CreateSingletonServices<
  Config,
  SingletonServices
> = async (config: Config): Promise<SingletonServices> => {
  const variablesService = new LocalVariablesService()
  const logger = new ConsoleLogger()

  const jwt = new JoseJWTService<UserSession>(
    async () => [
      {
        id: 'my-key',
        value: 'the-yellow-puppet',
      },
    ],
    logger
  )

  const schemaService = new AjvSchemaService(logger)
  const httpSessionService = new PikkuHTTPSessionService<UserSession>(jwt, {})

  return {
    config,
    logger,
    variablesService,
    jwt,
    httpSessionService,
    schemaService,
  }
}

/**
 * This function creates the session services on each request.
 * It's important to use the type CreateSessionServices here, as the pikku CLI uses them to improve the development experience!
 */
export const createSessionServices: CreateSessionServices<
  SingletonServices,
  Services,
  UserSession
> = async (_services, _session) => {
  return {}
}
