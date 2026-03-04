import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { pikkuServices } from '#pikku/pikku-types.gen.js'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { VercelAIAgentRunner } from '@pikku/ai-vercel'
import { createOpenAI } from '@ai-sdk/openai'

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

    if (backend === 'sqlite') {
      const { default: Database } = await import('better-sqlite3')
      const { Kysely, SqliteDialect } = await import('kysely')
      const { KyselyAIStorageService, KyselyAgentRunService } = await import(
        '@pikku/kysely'
      )
      const { SerializePlugin } = await import('kysely-plugin-serialize')
      const db = new Kysely({
        dialect: new SqliteDialect({ database: new Database(':memory:') }),
        plugins: [new SerializePlugin()],
      })
      aiStorage = new KyselyAIStorageService(db)
      await aiStorage.init()
      agentRunService = new KyselyAgentRunService(db)
    } else if (backend === 'postgres') {
      const { default: pg } = await import('postgres')
      const { PostgresJSDialect } = await import('kysely-postgres-js')
      const { Kysely } = await import('kysely')
      const { KyselyAIStorageService, KyselyAgentRunService } = await import(
        '@pikku/kysely'
      )
      const sql = pg(process.env.DATABASE_URL!)
      const db = new Kysely({
        dialect: new PostgresJSDialect({ postgres: sql }),
      })
      aiStorage = new KyselyAIStorageService(db)
      await aiStorage.init()
      agentRunService = new KyselyAgentRunService(db)
    } else if (backend === 'mysql') {
      const { Kysely, MysqlDialect } = await import('kysely')
      const { createPool } = await import('mysql2')
      const { KyselyAIStorageService, KyselyAgentRunService } = await import(
        '@pikku/kysely'
      )
      const db = new Kysely({
        dialect: new MysqlDialect({
          pool: createPool(process.env.DATABASE_URL!) as any,
        }),
      })
      aiStorage = new KyselyAIStorageService(db)
      await aiStorage.init()
      agentRunService = new KyselyAgentRunService(db)
    } else if (backend === 'pg') {
      const { default: pg } = await import('postgres')
      const { PgAIStorageService, PgAgentRunService } = await import(
        '@pikku/pg'
      )
      const sql = pg(process.env.DATABASE_URL!)
      aiStorage = new PgAIStorageService(sql)
      await aiStorage.init()
      agentRunService = new PgAgentRunService(sql)
    } else if (backend === 'redis') {
      const { default: Redis } = await import('ioredis')
      const { RedisAgentRunService } = await import('@pikku/redis')
      const { default: Database } = await import('better-sqlite3')
      const { Kysely, SqliteDialect } = await import('kysely')
      const { KyselyAIStorageService } = await import('@pikku/kysely')
      const { SerializePlugin } = await import('kysely-plugin-serialize')
      const redis = new Redis(process.env.REDIS_URL!)
      const db = new Kysely({
        dialect: new SqliteDialect({ database: new Database(':memory:') }),
        plugins: [new SerializePlugin()],
      })
      aiStorage = new KyselyAIStorageService(db)
      await aiStorage.init()
      agentRunService = new RedisAgentRunService(redis)
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
    }
  }
)
