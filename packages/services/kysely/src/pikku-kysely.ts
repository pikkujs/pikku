import type { Logger } from '@pikku/core/services'
import { CamelCasePlugin, Kysely } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'

export class PikkuKysely<DB> {
  public kysely: Kysely<DB>
  private postgres: postgres.Sql<{}>
  private poolConfig?: postgres.Options<{}>
  private ownsConnection: boolean

  constructor(
    private logger: Logger,
    connectionOrConfig: postgres.Sql<{}> | postgres.Options<{}>,
    defaultSchemaName?: string
  ) {
    // Check if it's a postgres.Sql instance or config options
    if (typeof connectionOrConfig === 'function') {
      // It's a postgres.Sql instance
      this.postgres = connectionOrConfig as postgres.Sql<{}>
      this.ownsConnection = false
    } else {
      // It's a config object
      this.poolConfig = connectionOrConfig
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
    if (this.poolConfig) {
      this.logger.info(
        `Connecting to database: ${this.poolConfig.host}:${this.poolConfig.port} with name ${this.poolConfig.database}`
      )
    } else {
      this.logger.info('Using existing postgres connection')
    }

    try {
      const response = await this.postgres`SELECT version();`
      const version = response[0]?.version
      this.logger.info(version)
    } catch (error) {
      this.logger.error('Error connecting to database', error)
      process.exit(1)
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
