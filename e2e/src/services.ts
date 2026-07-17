import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
  LocalCredentialService,
  InMemoryQueueService,
  isTestRun,
  stub,
} from '@pikku/core/services'
import type { EmailService } from '@pikku/core/services'
import { pikkuServices } from '#pikku/pikku-types.gen.js'
import { pikkuState } from '@pikku/core/internal'
import { BetterAuthCredentialService } from '@pikku/better-auth'
import { CREDENTIAL_OAUTH2_CONFIGS } from '#pikku/credentials/pikku-credentials.gen.js'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { VercelAIAgentRunner } from '@pikku/ai-vercel'
import { JoseJWTService } from '@pikku/jose'
import { createOpenAI } from '@ai-sdk/openai'
import type { KyselyPikkuDB } from '@pikku/kysely'
import { KyselyScopeService } from '@pikku/kysely'
import { requiredSingletonServices } from '#pikku/pikku-services.gen.js'
import { PikkuMetaService } from '../.pikku/pikku-meta-service.gen.js'

export const createSingletonServices = pikkuServices(
  async (config, { variables, secrets, metaService, emailService }) => {
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
      const { SerializePlugin } = await import('@pikku/kysely')
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
        (await variables.get('DATABASE_URL'))!
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
          pool: createPool((await variables.get('DATABASE_URL'))!) as any,
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

    // Dedicated plugin-free Kysely for Better Auth. Better Auth owns its own
    // user/session/account/verification tables and expects unmangled column
    // names, so it gets its own SQLite instance rather than sharing the
    // AI/workflow db (which runs CamelCase/Serialize plugins). The auth factory
    // runs Better Auth's migrations against it on first request.
    const { default: AuthDatabase } = await import('better-sqlite3')
    const {
      CamelCasePlugin: AuthCamelCase,
      Kysely: AuthKysely,
      SqliteDialect: AuthSqliteDialect,
    } = await import('kysely')
    const { SerializePlugin: AuthSerialize } = await import('@pikku/kysely')
    const authDatabase = new AuthDatabase(':memory:')
    const kysely = new AuthKysely<KyselyPikkuDB>({
      dialect: new AuthSqliteDialect({ database: authDatabase }),
    })

    // Shares the Better Auth *database* — not the Kysely instance — so
    // pikku_user_role can FK into better-auth's `user` table while the scope
    // service still addresses its own tables in camelCase (Better Auth needs an
    // unmangled, plugin-free instance; the scope service's query builders
    // expect CamelCase/Serialize). init()/syncScopes()/seeding run in
    // lifecycle.afterStart, once Better Auth has created the user table.
    const scopeDb = new AuthKysely<KyselyPikkuDB>({
      dialect: new AuthSqliteDialect({ database: authDatabase }),
      plugins: [new AuthCamelCase(), new AuthSerialize()],
    })
    const scopeService = new KyselyScopeService(scopeDb)

    // Dedicated plugin-enabled Kysely for webhook delivery history. Reuses the
    // CamelCase/Serialize plugins the AI/workflow db uses (the auth db above is
    // deliberately plugin-free), kept separate so it works across DB_BACKEND.
    const { KyselyWebhookService, SerializePlugin: WebhookSerializePlugin } =
      await import('@pikku/kysely')
    const { default: WebhookDatabase } = await import('better-sqlite3')
    const {
      Kysely: WebhookKysely,
      SqliteDialect: WebhookSqliteDialect,
      CamelCasePlugin: WebhookCamelCasePlugin,
    } = await import('kysely')
    const webhookDb = new WebhookKysely<KyselyPikkuDB>({
      dialect: new WebhookSqliteDialect({
        database: new WebhookDatabase(':memory:'),
      }),
      plugins: [new WebhookCamelCasePlugin(), new WebhookSerializePlugin()],
    })
    const queueService = new InMemoryQueueService()
    const webhookService = new KyselyWebhookService(queueService, webhookDb)
    await webhookService.init()

    // OAuth2 credentials resolve through better-auth's account table (linked via
    // authClient.oauth2.link), everything else stays local. getAuth must be lazy
    // and singletonServices assigned late: the auth factory is built FROM these
    // services, so resolving it here would deadlock on itself.
    let singletonServices: any
    let authPromise: Promise<any> | undefined
    const credentialService = new BetterAuthCredentialService({
      getAuth: () =>
        (authPromise ??= (
          pikkuState(null, 'package', 'authFactory') as any
        )(singletonServices)),
      oauth2Names: Object.keys(CREDENTIAL_OAUTH2_CONFIGS),
      singletonOAuth2Names: Object.entries(CREDENTIAL_OAUTH2_CONFIGS)
        .filter(([, config]) => config.type === 'singleton')
        .map(([name]) => name),
      fallback: new LocalCredentialService(),
    })

    const jwt = new JoseJWTService(async () => [
      { id: 'e2e-key', value: 'e2e-test-jwt-secret-key-at-least-32-chars' },
    ])
    await jwt.init()

    await secrets.setSecret('MOCK_OAUTH_APP', {
      clientId: 'mock-client-id',
      clientSecret: 'mock-client-secret',
    })

    await secrets.setSecret('SLACK_OAUTH_APP', {
      clientId: '00512a03116f14d0000000003',
      clientSecret: 'K005p2Yl6t9kDmAppyq0vsKlxcW1Y7I',
    })

    await secrets.setSecret(
      'BETTER_AUTH_SECRET',
      'e2e-better-auth-secret-key-at-least-32-chars'
    )

    await secrets.setSecret('GITHUB_OAUTH', {
      clientId: 'mock-github-client-id',
      clientSecret: 'mock-github-secret',
    })

    // The e2e suite has no SMTP relay: under `pikku dev --test` the email
    // service is a recording fake whose support-actor recipient always fails,
    // so scenarios can assert sends (expectService) and walk the error branch
    // (expectError). Outside test runs the dev-provided service is forwarded.
    const email = isTestRun()
      ? stub<EmailService>('emailService', {
          send: async ({ to }) => {
            if (to === 'support@actors.local') {
              throw new Error('smtp relay declined for support actor')
            }
            return { messageId: 'stubbed-message' }
          },
        })
      : emailService

    singletonServices = {
      config,
      variables,
      secrets,
      emailService: email,
      kysely,
      scopeService,
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
      queueService,
      webhookService,
    }
    return singletonServices
  }
)
