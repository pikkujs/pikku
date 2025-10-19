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
  singletonServices,
} from '../.pikku/pikku-services.gen.js'

/**
 * Application configuration
 * Created once on startup
 */
export const createConfig: CreateConfig<Config> = async () => {
  return {
    // Your config here
  }
}

/**
 * Singleton services - created once on application start
 *
 * IMPORTANT: Use conditional/async loading for services to enable tree-shaking
 * Only load services that are actually used in your functions
 */
export const createSingletonServices: CreateSingletonServices<
  Config,
  RequiredSingletonServices
> = async (config: Config): Promise<RequiredSingletonServices> => {
  // Always-needed services
  const variables = new LocalVariablesService()
  const logger = new ConsoleLogger()
  const schema = new CFWorkerSchemaService(logger)

  // ✅ IMPORTANT: Conditional loading - only create JWT service if used
  // This enables tree-shaking and reduces bundle size
  let jwt: JWTService | undefined
  if (singletonServices.jwt) {
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
  }
}

/**
 * Session services - created on each request
 * Use for request-scoped services like database connections
 *
 * CRITICAL: Always destructure services in the first parameter
 */
export const createSessionServices: CreateSessionServices<
  SingletonServices,
  Services,
  UserSession
> = async ({ logger, config }, interaction, session) => {
  // ✅ CORRECT: Services destructured in parameter list
  // interaction contains route, method, etc.
  // session contains user session data

  // Example: Create a database connection per request
  // const db = await createDbConnection(config.dbUrl)

  return {
    // Add your session services here
  }
}
