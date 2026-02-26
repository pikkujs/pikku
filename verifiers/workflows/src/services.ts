import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku'
import {
  ConsoleLogger,
  JWTService,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import {
  RequiredSingletonServices,
  requiredSingletonServices,
} from '#pikku/pikku-services.gen.js'

export const createConfig = pikkuConfig(async () => {
  return {}
})

/**
 * This function creates the singleton services used by the application and is created once on start.
 * It's important to use the types here, as the pikku CLI uses them to improve the development experience!
 */
export const createSingletonServices = pikkuServices(
  async (config, existingServices): Promise<RequiredSingletonServices> => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const secrets =
      existingServices?.secrets || new LocalSecretService(variables)
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
      secrets,
      logger,
      variables,
      schema,
      jwt,
      workflowService: existingServices?.workflowService,
      queueService: existingServices?.queueService,
      schedulerService: existingServices?.schedulerService,
    }
  }
)

/**
 * This function creates the wire services on each request.
 * It's important to use the type CreateWireServices here, as the pikku CLI uses them to improve the development experience!
 */
export const createWireServices = pikkuWireServices(
  async (_singletonServices, _session) => {
    return {}
  }
)
