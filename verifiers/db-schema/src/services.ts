import { pikkuServices, pikkuWireServices } from '#pikku'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import type { KyselyPikkuDB } from '@pikku/kysely'
import type { LabelsDB } from '@pikku/verifier-db-addon/types'

import '../.pikku/pikku-bootstrap.gen.js'

type DB = KyselyPikkuDB & LabelsDB

/**
 * No `CamelCasePlugin` on either dialect, deliberately.
 *
 * The runtime declaration binds it itself when it compiles, so a Kysely that
 * had already applied it would be casing the same identifiers twice. Both
 * dialects are built the same way here so the only difference between the two
 * verifier passes is the database.
 */
const openDatabase = (config: {
  sqliteDb?: string
  postgresUrl?: string
}): Kysely<DB> =>
  config.postgresUrl
    ? new Kysely<DB>({
        dialect: new PostgresJSDialect({
          postgres: postgres(config.postgresUrl, { max: 4 }),
        }),
      })
    : new Kysely<DB>({
        dialect: new SqliteDialect({
          database: new Database(config.sqliteDb!),
        }),
      })

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const variables = existingServices?.variables ?? new LocalVariablesService()
    const secrets =
      existingServices?.secrets ?? new LocalSecretService(variables)
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)
    const kysely = openDatabase(config)

    await secrets.setSecret(
      'BETTER_AUTH_SECRET',
      'verifier-db-schema-secret-key-32ch!!'
    )

    return { config, secrets, logger, variables, schema, kysely }
  }
)

export const createWireServices = pikkuWireServices(async () => ({}) as any)
