import { randomBytes } from 'node:crypto'
import {
  CamelCasePlugin,
  Kysely,
  MysqlDialect,
  type KyselyPlugin,
} from 'kysely'
import type { ResolvedMysqlDb } from '../local-db.js'

/**
 * One connection to a MySQL server, shaped like the Postgres client the other
 * `db` code already speaks.
 *
 * A single connection rather than a pool: `FOREIGN_KEY_CHECKS` and a scratch
 * database's `USE` are session state, and a pool answers consecutive statements
 * on different sessions. `multipleStatements` is on because a migration file is
 * one string holding many statements.
 */
export interface MysqlQueryClient {
  /** The URL this client is connected with, for opening a Kysely pool to the same database. */
  url: string
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  exec(sql: string): Promise<unknown>
  end(): Promise<void>
}

async function connect(url: string): Promise<MysqlQueryClient> {
  const { createConnection } = await import('mysql2/promise')
  const connection = await createConnection({
    uri: url,
    multipleStatements: true,
  })
  const query = async <T>(sql: string, params?: unknown[]) => {
    const [rows] = await connection.query(sql, params)
    return { rows: (Array.isArray(rows) ? rows : []) as T[] }
  }
  return {
    url,
    query,
    exec: (sql) => connection.query(sql),
    end: () => connection.end(),
  }
}

export async function withMysqlClient<T>(
  resolved: ResolvedMysqlDb,
  run: (client: MysqlQueryClient) => Promise<T>
): Promise<T> {
  const client = await connect(resolved.connectionString)
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

const withDatabase = (url: string, database: string): string => {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`
  return parsed.toString()
}

/**
 * Run against a database that exists only for the duration of `run`.
 *
 * MySQL has no embedded engine to throw away the way PGlite and `:memory:` are,
 * so the throwaway is a database on the configured server, created and dropped
 * around the call. The configured role therefore needs `CREATE`/`DROP` on
 * databases — the one requirement `db migrate` has on MySQL that it does not
 * have on Postgres.
 */
export async function withScratchMysqlDatabase<T>(
  resolved: Pick<ResolvedMysqlDb, 'connectionString'>,
  run: (client: MysqlQueryClient) => Promise<T>
): Promise<T> {
  const name = `pikku_scratch_${randomBytes(6).toString('hex')}`
  const admin = await connect(resolved.connectionString)
  try {
    try {
      await admin.exec(`CREATE DATABASE \`${name}\``)
    } catch (error: any) {
      throw new Error(
        `Could not create a scratch database to apply the migrations to: ${error?.message ?? error}. ` +
          'MySQL has no embedded engine, so db migrate --scratch, db generate and db check build a ' +
          'throwaway database on the configured server — grant the role CREATE and DROP, or point ' +
          'mysqlUrl at a server you administer.'
      )
    }
    const scratch = await connect(withDatabase(resolved.connectionString, name))
    try {
      return await run(scratch)
    } finally {
      await scratch.end()
    }
  } finally {
    await admin.exec(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {})
    await admin.end()
  }
}

export interface CreateMysqlKyselyOptions {
  url: string
  camelCase?: boolean
  plugins?: KyselyPlugin[]
}

export async function createMysqlKysely<DB>(
  options: CreateMysqlKyselyOptions
): Promise<Kysely<DB>> {
  const { createPool } = await import('mysql2')
  // decimalNumbers: DECIMAL comes back a string by default, while the
  // generated types say number. BIGINT stays a number (mysql2's default, exact
  // to 2^53), which is what the types say too.
  const pool = createPool({
    uri: options.url,
    connectionLimit: 10,
    decimalNumbers: true,
  })
  return new Kysely<DB>({
    dialect: new MysqlDialect({ pool }),
    plugins: [
      ...((options.camelCase ?? true) ? [new CamelCasePlugin()] : []),
      ...(options.plugins ?? []),
    ],
  })
}
