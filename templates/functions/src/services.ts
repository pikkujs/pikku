import {
  ConsoleLogger,
  JWTService,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { requiredSingletonServices } from '../.pikku/pikku-services.gen.js'
import {
  pikkuConfig,
  pikkuServices,
  pikkuWireServices,
} from '../.pikku/pikku-types.gen.js'

export const createConfig = pikkuConfig(async () => {
  return {}
})

/**
 * Creates singleton services for the todo app.
 * Includes JWT for authentication and optional EventHub for real-time updates.
 */
export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)
    const secrets = new LocalSecretService()

    let jwt: JWTService | undefined
    if (requiredSingletonServices.jwt) {
      const { JoseJWTService } = await import('@pikku/jose')
      jwt = new JoseJWTService(
        async () => [
          {
            id: 'todo-app-key',
            value: 'super-secret-jwt-key-change-in-production',
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
      secrets,
      eventHub: existingServices?.eventHub,
      workflowService: existingServices?.workflowService,
      queueService: existingServices?.queueService,
      schedulerService: existingServices?.schedulerService,
    }
  }
)

/**
 * Creates per-request wire services.
 */
export const createWireServices = pikkuWireServices(
  async (_singletonServices, _session) => {
    return {}
  }
)
