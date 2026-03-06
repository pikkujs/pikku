import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { pikkuServices } from '#pikku/pikku-types.gen.js'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { VercelAIAgentRunner } from '@pikku/ai-vercel'
import { createOpenAI } from '@ai-sdk/openai'
import type { KyselyPikkuDB } from '@pikku/kysely'

export const createSingletonServices = pikkuServices(
  async (config, { variables, secrets }) => {
    const logger = new ConsoleLogger()

    if (config.logLevel) {
      logger.setLevel(config.logLevel)
    }

    if (!variables) {
      variables = new LocalVariablesService()
    }

    if (!secrets) {
      secrets = new LocalSecretService(variables)
    }

    const schema = new CFWorkerSchemaService(logger)

    const aiAgentRunner = new VercelAIAgentRunner({
      openai: createOpenAI(),
    })

    const backend = process.env.DB_BACKEND ?? 'sqlite'
    let aiStorage: any
    let agentRunService: any

    let workflowService: any
    let workflowRunService: any

    if (backend === 'sqlite') {
      const { default: Database } = await import('better-sqlite3')
      const { Kysely, SqliteDialect } = await import('kysely')
      const {
        KyselyAIStorageService,
        KyselyAgentRunService,
        KyselyWorkflowService,
        KyselyWorkflowRunService,
      } = await import('@pikku/kysely')
      const { SerializePlugin } = await import('kysely-plugin-serialize')
      const db = new Kysely<KyselyPikkuDB>({
        dialect: new SqliteDialect({ database: new Database(':memory:') }),
        plugins: [new SerializePlugin()],
      })
      aiStorage = new KyselyAIStorageService(db)
      await aiStorage.init()
      agentRunService = new KyselyAgentRunService(db)
      workflowService = new KyselyWorkflowService(db)
      await workflowService.init()
      // SQLite doesn't support FOR UPDATE - use no-op locks (safe for single-process in-memory)
      workflowService.withRunLock = async (
        _id: string,
        fn: () => Promise<any>
      ) => fn()
      workflowService.withStepLock = async (
        _runId: string,
        _stepName: string,
        fn: () => Promise<any>
      ) => fn()
      workflowRunService = new KyselyWorkflowRunService(db)
    } else if (backend === 'postgres') {
      const { default: pg } = await import('postgres')
      const { PostgresJSDialect } = await import('kysely-postgres-js')
      const { Kysely } = await import('kysely')
      const {
        KyselyAIStorageService,
        KyselyAgentRunService,
        KyselyWorkflowService,
        KyselyWorkflowRunService,
      } = await import('@pikku/kysely')
      const sql = pg(process.env.DATABASE_URL!)
      const db = new Kysely<KyselyPikkuDB>({
        dialect: new PostgresJSDialect({ postgres: sql }),
      })
      aiStorage = new KyselyAIStorageService(db)
      await aiStorage.init()
      agentRunService = new KyselyAgentRunService(db)
      workflowService = new KyselyWorkflowService(db)
      await workflowService.init()
      workflowRunService = new KyselyWorkflowRunService(db)
    } else if (backend === 'mysql') {
      const { Kysely, MysqlDialect } = await import('kysely')
      const { createPool } = await import('mysql2')
      const {
        KyselyAIStorageService,
        KyselyAgentRunService,
        KyselyWorkflowService,
        KyselyWorkflowRunService,
      } = await import('@pikku/kysely')
      const db = new Kysely<KyselyPikkuDB>({
        dialect: new MysqlDialect({
          pool: createPool(process.env.DATABASE_URL!) as any,
        }),
      })
      aiStorage = new KyselyAIStorageService(db)
      await aiStorage.init()
      agentRunService = new KyselyAgentRunService(db)
      workflowService = new KyselyWorkflowService(db)
      await workflowService.init()
      workflowRunService = new KyselyWorkflowRunService(db)
    } else if (backend === 'redis') {
      const { default: Redis } = await import('ioredis')
      const { RedisAgentRunService } = await import('@pikku/redis')
      const { default: Database } = await import('better-sqlite3')
      const { Kysely, SqliteDialect } = await import('kysely')
      const {
        KyselyAIStorageService,
        KyselyWorkflowService,
        KyselyWorkflowRunService,
      } = await import('@pikku/kysely')
      const { SerializePlugin } = await import('kysely-plugin-serialize')
      const redis = new Redis(process.env.REDIS_URL!)
      const db = new Kysely<KyselyPikkuDB>({
        dialect: new SqliteDialect({ database: new Database(':memory:') }),
        plugins: [new SerializePlugin()],
      })
      aiStorage = new KyselyAIStorageService(db)
      await aiStorage.init()
      agentRunService = new RedisAgentRunService(redis)
      workflowService = new KyselyWorkflowService(db)
      await workflowService.init()
      workflowService.withRunLock = async (
        _id: string,
        fn: () => Promise<any>
      ) => fn()
      workflowService.withStepLock = async (
        _runId: string,
        _stepName: string,
        fn: () => Promise<any>
      ) => fn()
      workflowRunService = new KyselyWorkflowRunService(db)
    } else {
      throw new Error(`Unknown DB_BACKEND: ${backend}`)
    }

    return {
      config,
      variables,
      secrets,
      schema,
      logger,
      aiStorage,
      aiRunState: aiStorage,
      agentRunService,
      aiAgentRunner,
      workflowService,
      workflowRunService,
    }
  }
)
