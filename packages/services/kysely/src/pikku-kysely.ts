import type { Logger } from '@pikku/core/services'
import { CamelCasePlugin, Kysely } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'

export class PikkuKysely<DB> {
  public kysely: Kysely<DB>
  private postgres: postgres.Sql<{}>

  constructor(
    private logger: Logger,
    private poolConfig: postgres.Options<{}>,
    defaultSchemaName: string
  ) {
    delete poolConfig.ssl
    this.postgres = postgres(poolConfig)
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
    this.logger.info(
      `Connecting to database: ${this.poolConfig.host}:${this.poolConfig.port} with name ${this.poolConfig.database}`
    )
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
  }
}
