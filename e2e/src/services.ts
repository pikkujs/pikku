import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
  LocalCredentialService,
} from '@pikku/core/services'
import { pikkuServices } from '#pikku/pikku-types.gen.js'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { VercelAIAgentRunner } from '@pikku/ai-vercel'
import { JoseJWTService } from '@pikku/jose'
import { createOpenAI } from '@ai-sdk/openai'
import type { KyselyPikkuDB } from '@pikku/kysely'
import { requiredSingletonServices } from '#pikku/pikku-services.gen.js'

export const createSingletonServices = pikkuServices(
  async (config, { variables, secrets, metaService }) => {
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

    if (requiredSingletonServices.metaService && metaService === undefined) {
      const { PikkuMetaService } = await import(
        '../.pikku/pikku-meta-service.gen.js'
      )
      metaService = new PikkuMetaService()
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
      const { CamelCasePlugin, Kysely, SqliteDialect } = await import('kysely')
      const {
        SQLiteKyselyAIStorageService,
        SQLiteKyselyAgentRunService,
        SQLiteKyselyWorkflowService,
        SQLiteKyselyWorkflowRunService,
      } = await import('@pikku/kysely-sqlite')
      const { SerializePlugin } = await import('kysely-plugin-serialize')
      const db = new Kysely<KyselyPikkuDB>({
        dialect: new SqliteDialect({ database: new Database(':memory:') }),
        plugins: [new CamelCasePlugin(), new SerializePlugin()],
      })
      aiStorage = new SQLiteKyselyAIStorageService(db)
      await aiStorage.init()
      agentRunService = new SQLiteKyselyAgentRunService(db)
      workflowService = new SQLiteKyselyWorkflowService(db)
      await workflowService.init()
      workflowRunService = new SQLiteKyselyWorkflowRunService(db)
    } else if (backend === 'postgres') {
      const {
        PikkuKysely,
        PgKyselyAIStorageService,
        PgKyselyAgentRunService,
        PgKyselyWorkflowService,
        PgKyselyWorkflowRunService,
      } = await import('@pikku/kysely-postgres')
      const pikkuKysely = new PikkuKysely<KyselyPikkuDB>(
        logger,
        variables.get('DATABASE_URL')!
      )
      await pikkuKysely.init()
      aiStorage = new PgKyselyAIStorageService(pikkuKysely.kysely)
      await aiStorage.init()
      agentRunService = new PgKyselyAgentRunService(pikkuKysely.kysely)
      workflowService = new PgKyselyWorkflowService(pikkuKysely.kysely)
      await workflowService.init()
      workflowRunService = new PgKyselyWorkflowRunService(pikkuKysely.kysely)
    } else if (backend === 'mysql') {
      const { CamelCasePlugin, Kysely, MysqlDialect } = await import('kysely')
      const { createPool } = await import('mysql2')
      const {
        MySQLKyselyAIStorageService,
        MySQLKyselyAgentRunService,
        MySQLKyselyWorkflowService,
        MySQLKyselyWorkflowRunService,
      } = await import('@pikku/kysely-mysql')
      const db = new Kysely<KyselyPikkuDB>({
        dialect: new MysqlDialect({
          pool: createPool(variables.get('DATABASE_URL')!) as any,
        }),
        plugins: [new CamelCasePlugin()],
      })
      aiStorage = new MySQLKyselyAIStorageService(db)
      await aiStorage.init()
      agentRunService = new MySQLKyselyAgentRunService(db)
      workflowService = new MySQLKyselyWorkflowService(db)
      await workflowService.init()
      workflowRunService = new MySQLKyselyWorkflowRunService(db)
      // } else if (backend === 'redis') {
      // const { default: Redis } = await import('ioredis')
      // const { RedisAgentRunService, RedisAIStorageService, RedisWorkflowService, RedisWorkflowRunService } = await import('@pikku/redis')
      // const { default: Database } = await import('better-sqlite3')
      // const redis = new Redis(process.env.REDIS_URL!)
      // aiStorage = new RedisAIStorageService(redis)
      // await aiStorage.init()
      // agentRunService = new RedisAgentRunService(redis)
      // workflowService = new RedisWorkflowService(redis)
      // await workflowService.init()
      // workflowRunService = new RedisWorkflowRunService(redis)
    } else {
      throw new Error(`Unknown DB_BACKEND: ${backend}`)
    }

    const credentialService = new LocalCredentialService()

    const jwt = new JoseJWTService(async () => [
      { id: 'e2e-key', value: 'e2e-test-jwt-secret-key-at-least-32-chars' },
    ])
    await jwt.init()

    await secrets.setSecretJSON('MOCK_OAUTH_APP', {
      clientId: 'mock-client-id',
      clientSecret: 'mock-client-secret',
    })

    await secrets.setSecretJSON('SLACK_OAUTH_APP', {
      clientId: '00512a03116f14d0000000003',
      clientSecret: 'K005p2Yl6t9kDmAppyq0vsKlxcW1Y7I',
    })

    return {
      config,
      variables,
      secrets,
      credentialService,
      jwt,
      schema,
      logger,
      metaService,
      aiStorage,
      aiRunState: aiStorage,
      agentRunService,
      aiAgentRunner,
      workflowService,
      workflowRunService,
    }
  }
)
