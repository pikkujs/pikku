import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type KyselyPlugin,
  type QueryCompiler,
  type QueryResult,
} from 'kysely'
import type { Kysely as KyselyInstance } from 'kysely'
import type { PGlite } from '@electric-sql/pglite'

export interface CreatePGliteKyselyOptions {
  db: PGlite
  camelCase?: boolean
  plugins?: KyselyPlugin[]
}

export function createPGliteKysely<DB>(
  options: CreatePGliteKyselyOptions
): Kysely<DB> {
  const plugins: KyselyPlugin[] = []
  if (options.camelCase ?? true) plugins.push(new CamelCasePlugin())
  if (options.plugins) plugins.push(...options.plugins)

  return new Kysely<DB>({
    dialect: new PGliteDialect(options.db),
    plugins,
  })
}

class PGliteDialect implements Dialect {
  constructor(private readonly db: PGlite) {}

  createAdapter(): DialectAdapter {
    return new PostgresAdapter()
  }

  createDriver(): Driver {
    return new PGliteDriver(this.db)
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler()
  }

  createIntrospector(db: KyselyInstance<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db)
  }
}

class PGliteDriver implements Driver {
  private readonly connection: PGliteConnection

  constructor(db: PGlite) {
    this.connection = new PGliteConnection(db)
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.connection
  }

  async beginTransaction(conn: DatabaseConnection): Promise<void> {
    await (conn as PGliteConnection).executeRaw('BEGIN')
  }

  async commitTransaction(conn: DatabaseConnection): Promise<void> {
    await (conn as PGliteConnection).executeRaw('COMMIT')
  }

  async rollbackTransaction(conn: DatabaseConnection): Promise<void> {
    await (conn as PGliteConnection).executeRaw('ROLLBACK')
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {
    await this.connection.close()
  }
}

class PGliteConnection implements DatabaseConnection {
  constructor(private readonly db: PGlite) {}

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const result = await this.db.query<R>(query.sql, [...query.parameters])
    return {
      rows: result.rows,
      numAffectedRows:
        result.affectedRows !== undefined
          ? BigInt(result.affectedRows)
          : undefined,
    }
  }

  async *streamQuery<R>(
    query: CompiledQuery
  ): AsyncIterableIterator<QueryResult<R>> {
    yield await this.executeQuery<R>(query)
  }

  async executeRaw(sql: string): Promise<void> {
    await this.db.exec(sql)
  }

  async close(): Promise<void> {
    if (!this.db.closed) {
      await this.db.close()
    }
  }
}
