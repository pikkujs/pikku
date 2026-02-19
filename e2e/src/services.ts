import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { PgWorkflowService } from '@pikku/pg'
import { PgBossServiceFactory } from '@pikku/queue-pg-boss'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import postgres from 'postgres'
import {
  pikkuConfig,
  pikkuServices,
  pikkuWireServices,
} from '../.pikku/pikku-types.gen.js'

const DEFAULT_DATABASE_URL =
  'postgres://postgres:password@localhost:5432/pikku_queue'

const resolveDatabaseUrl = (): string =>
  process.env.E2E_DATABASE_URL ||
  process.env.DATABASE_URL ||
  DEFAULT_DATABASE_URL

type Infrastructure = {
  queueService?: any
  createWorkflowService?: (params: {
    logger: any
    queueService?: any
    schedulerService?: any
    workflow?: any
  }) => any
  createSchedulerService?: (logger: any) => any
  createQueueWorkers?: (runFunction: any, logger: any) => any
  close: () => Promise<void>
}

export const createConfig = pikkuConfig(async () => {
  return {
    awsRegion: 'us-east-1',
  }
})

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)
    const secrets = new LocalSecretService()

    return {
      config,
      logger: existingServices?.logger || logger,
      variables,
      schema,
      secrets,
      jwt: existingServices?.jwt,
      queueService: existingServices?.queueService,
      schedulerService: existingServices?.schedulerService,
      workflowService: existingServices?.workflowService,
      deploymentService: existingServices?.deploymentService,
      aiStorage: existingServices?.aiStorage,
      aiAgentRunner: existingServices?.aiAgentRunner,
      aiRunState: existingServices?.aiRunState,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})

export const createInfrastructure = async (): Promise<Infrastructure> => {
  const backend = process.env.E2E_BACKEND || 'postgres'
  const profile = process.env.E2E_PROFILE || 'default'
  if (backend !== 'postgres') {
    throw new Error(`Unsupported E2E_BACKEND: ${backend}`)
  }

  if (profile === 'profile-api-only') {
    return {
      close: async () => {},
    }
  }

  const databaseUrl = resolveDatabaseUrl()
  const pgBossFactory = new PgBossServiceFactory(databaseUrl)
  await pgBossFactory.init()

  const sql = postgres(databaseUrl)
  let workflowService: PgWorkflowService | undefined

  return {
    queueService: pgBossFactory.getQueueService(),
    createWorkflowService:
      profile === 'profile-workflow-misconfig'
        ? undefined
        : ({ logger, queueService, schedulerService, workflow }) => {
            workflowService = new PgWorkflowService(sql, 'pikku', {
              logger,
              queueService,
              schedulerService,
              workflow,
            })
            return workflowService
          },
    createSchedulerService: (logger) =>
      pgBossFactory.getSchedulerService(logger),
    createQueueWorkers: (runFunction, logger) =>
      pgBossFactory.getQueueWorkers(runFunction, logger),
    close: async () => {
      await pgBossFactory.close()
      await workflowService?.close?.()
      await sql.end()
    },
  }
}
