import { pikkuServices, pikkuWireServices } from '#pikku'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import type { LabelsDB } from '@pikku/verifier-db-addon/types'

import '../.pikku/pikku-bootstrap.gen.js'

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const variables = existingServices?.variables ?? new LocalVariablesService()
    const secrets =
      existingServices?.secrets ?? new LocalSecretService(variables)
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)

    const kysely = new Kysely<KyselyPikkuDB & LabelsDB>({
      dialect: new SqliteDialect({
        database: new Database(config.sqliteDb),
      }),
    })

    await secrets.setSecret(
      'BETTER_AUTH_SECRET',
      'verifier-db-schema-secret-key-32ch!!'
    )

    return { config, secrets, logger, variables, schema, kysely }
  }
)

export const createWireServices = pikkuWireServices(async () => ({}) as any)
