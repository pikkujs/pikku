import type {
  Config,
  Services,
  SingletonServices,
  UserSession,
} from '../types/application-types.d.js'
import {
  CreateConfig,
  CreateSessionServices,
  CreateSingletonServices,
} from '@pikku/core'
import {
  ConsoleLogger,
  JWTService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import {
  RequiredSingletonServices,
  requiredSingletonServices,
} from '../.pikku/pikku-services.gen.js'

export const createConfig: CreateConfig<Config> = async () => {
  return {}
}

/**
 * This function creates the singleton services used by the application and is created once on start.
 * It's important to use the types here, as the pikku CLI uses them to improve the development experience!
 */
export const createSingletonServices: CreateSingletonServices<
  Config,
  RequiredSingletonServices
> = async (
  config: Config,
  existingServices?: Partial<SingletonServices>
): Promise<RequiredSingletonServices> => {
  const variables = existingServices?.variables || new LocalVariablesService()
  const logger = new ConsoleLogger()

  const schema = new CFWorkerSchemaService(logger)

  // Only create JWT service if it's actually needed
  let jwt: JWTService | undefined
  if (requiredSingletonServices.jwt) {
    const { JoseJWTService } = await import('@pikku/jose')
    jwt = new JoseJWTService(
      async () => [
        {
          id: 'my-key',
          value: 'the-yellow-puppet',
        },
      ],
      logger
    )
  }

  return {
    config,
    logger,
    variables,
    schema,
    jwt,
    workflowState: existingServices?.workflowState,
    queueService: existingServices?.queueService,
    schedulerService: existingServices?.schedulerService,
  } as any
}

/**
 * This function creates the session services on each request.
 * It's important to use the type CreateSessionServices here, as the pikku CLI uses them to improve the development experience!
 */
export const createSessionServices: CreateSessionServices<
  SingletonServices,
  Services,
  UserSession
> = async (_singletonServices, _interaction, _session) => {
  return {}
}
