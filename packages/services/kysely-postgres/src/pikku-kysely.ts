import type { Logger } from '@pikku/core/services'
import { CamelCasePlugin, Kysely } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'

export class PikkuKysely<DB> {
  public kysely: Kysely<DB>
  private postgres: postgres.Sql<{}>
  private ownsConnection: boolean

  constructor(
    private logger: Logger,
    connectionOrConfig: postgres.Sql<{}> | postgres.Options<{}> | string,
    defaultSchemaName?: string
  ) {
    // Check if it's a postgres.Sql instance, a connection string, or config options
    if (typeof connectionOrConfig === 'function') {
      // It's a postgres.Sql instance
      this.postgres = connectionOrConfig as postgres.Sql<{}>
      this.ownsConnection = false
    } else if (typeof connectionOrConfig === 'string') {
      // It's a connection string URL
      this.postgres = postgres(connectionOrConfig)
      this.ownsConnection = true
    } else {
      // It's a config object
      this.postgres = postgres(connectionOrConfig)
      this.ownsConnection = true
    }

    this.kysely = new Kysely<DB>({
      dialect: new PostgresJSDialect({
        postgres: this.postgres,
      }),
      plugins: [new CamelCasePlugin()],
    })

    if (defaultSchemaName) {
      this.kysely = this.kysely.withSchema(defaultSchemaName)
    }
  }

  public async init() {
    this.logger.info('Connecting to database...')

    try {
      const response = await this.postgres`SELECT version();`
      const version = response[0]?.version
      this.logger.info(version)
    } catch (error) {
      this.logger.error('Error connecting to database', error)
      throw error
    }
  }

  public async close() {
    await this.kysely.destroy()
    // Only end the connection if we created it
    if (this.ownsConnection) {
      await this.postgres.end()
    }
  }
}
