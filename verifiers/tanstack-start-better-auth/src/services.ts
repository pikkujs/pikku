import {
  pikkuConfig,
  pikkuServices,
} from '#pikku/function/pikku-function-types.gen.js'
import { ConsoleLogger, LocalSecretService } from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import path from 'node:path'
import { auth } from './auth.js'

const databaseFile =
  process.env.BETTER_AUTH_DB_FILE ??
  path.join(process.cwd(), '.better-auth.sqlite')
const database = new Database(databaseFile)
const kysely = new Kysely<KyselyPikkuDB>({
  dialect: new SqliteDialect({ database }),
})

export const createConfig = pikkuConfig(async () => ({
  port: Number(process.env.PORT ?? '3121'),
  hostname: '127.0.0.1',
}))

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const secrets = existingServices?.secrets ?? new LocalSecretService()
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)

    await secrets.setSecret(
      'BETTER_AUTH_SECRET',
      'verifier-start-better-auth-secret-32'
    )

    let authPromise: Promise<Awaited<ReturnType<typeof auth>>> | undefined

    const singletonServices = {
      config,
      secrets,
      logger,
      schema,
      kysely,
      auth: async () => {
        authPromise ??= Promise.resolve(auth(singletonServices as any))
        return await authPromise
      },
    }

    return singletonServices
  }
)
