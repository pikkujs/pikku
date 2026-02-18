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
  schedulerService?: any
  workflowService?: any
  createQueueWorkers?: (singletonServices: any, createWireServices: any) => any
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
      logger,
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
  const workflowService =
    profile === 'profile-workflow-misconfig'
      ? undefined
      : new PgWorkflowService(sql)
  if (workflowService) {
    await workflowService.init()
  }

  return {
    queueService: pgBossFactory.getQueueService(),
    schedulerService: pgBossFactory.getSchedulerService(),
    workflowService,
    createQueueWorkers: (singletonServices, runtimeWireServices) =>
      pgBossFactory.getQueueWorkers(
        singletonServices as any,
        runtimeWireServices
      ),
    close: async () => {
      await pgBossFactory.close()
      await workflowService?.close?.()
      await sql.end()
    },
  }
}
