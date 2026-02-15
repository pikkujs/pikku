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
import { TodoStore } from './services/store.service.js'
import type {
  AIStorageService,
  AIAgentRunnerService,
  AIRunStateService,
} from '@pikku/core/services'

export const createConfig = pikkuConfig(async () => {
  return {
    awsRegion: 'us-east-1',
  }
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

    let aiStorage: AIStorageService | undefined
    let aiAgentRunner: AIAgentRunnerService | undefined
    let aiRunState: AIRunStateService | undefined
    if (process.env.POSTGRES_URL) {
      const postgres = (await import('postgres')).default
      const { PgAIStorageService } = await import('@pikku/pg')
      const sql = postgres(process.env.POSTGRES_URL)
      const pgAiStorage = new PgAIStorageService(sql)
      await pgAiStorage.init()
      aiStorage = pgAiStorage
      aiRunState = pgAiStorage

      const { VercelAIAgentRunner } = await import('@pikku/ai-vercel')
      aiAgentRunner = new VercelAIAgentRunner(secrets)
    }

    return {
      config,
      logger,
      variables,
      schema,
      jwt,
      secrets,
      todoStore: existingServices?.todoStore || new TodoStore(),
      aiStorage: existingServices?.aiStorage || aiStorage,
      aiAgentRunner: existingServices?.aiAgentRunner || aiAgentRunner,
      aiRunState: existingServices?.aiRunState || aiRunState,
      eventHub: existingServices?.eventHub,
      workflowService: existingServices?.workflowService,
      queueService: existingServices?.queueService,
      schedulerService: existingServices?.schedulerService,
      deploymentService: existingServices?.deploymentService,
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
