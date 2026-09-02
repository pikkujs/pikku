/**
 * The command line a shipped standalone artifact answers on.
 *
 * A hosted deploy has a control plane to run migrations and read state; a
 * standalone artifact is a file on a machine, and the operator holding it has
 * nothing but the process itself. Without this, applying a migration to the
 * database the bundle opens means installing the CLI and a checkout beside it
 * on the production host, which is the thing shipping a single bundle was
 * supposed to remove.
 *
 * The set is deliberately small. `serve` is the default so `node bundle.js`
 * keeps meaning what it has always meant, and every other command exits rather
 * than opening a port.
 *
 * Notably absent is a way to invoke an RPC. A running server already answers
 * them over its own wire with auth, sessions and middleware applied; an
 * in-process invoke would answer them with none of that, which on a production
 * box is a way to run any function as nobody.
 */
import type { MigrationExecutor } from '@pikku/db-migrator'
import type { PostgresMigrationClient } from '@pikku/db-migrator/postgres'

/** Where the migrations live, when the operator has moved them. */
export const MIGRATIONS_DIR_ENV = 'PIKKU_MIGRATIONS_DIR'

export interface StandaloneSqliteDb {
  engine: 'sqlite'
  migrationsDir: string
  /** The file the app itself opens, so a migration cannot target another one. */
  databaseFile: string
}

/**
 * The postgres.js tagged template the app is already connected through.
 *
 * Taken rather than constructed so a migration runs on the app's own pool: a
 * second connection would need the credentials resolved twice and could reach a
 * different database than the one the next `serve` opens.
 */
export interface PostgresSql {
  unsafe(query: string, parameters?: unknown[]): Promise<any> & {
    simple(): Promise<any>
  }
  begin<T>(handler: (sql: PostgresSql) => Promise<T>): Promise<T>
}

export interface StandalonePostgresDb {
  engine: 'postgres'
  migrationsDir: string
  sql: PostgresSql
}

export type StandaloneDb = StandaloneSqliteDb | StandalonePostgresDb

export type StandaloneCommand =
  | { kind: 'serve' }
  | { kind: 'db'; action: 'migrate' | 'status' }
  | { kind: 'backup'; destination: string }
  | { kind: 'exit'; code: number }

export interface ParseOptions {
  version: string
  /** False for a build with no database, whose db commands cannot be answered. */
  hasDb: boolean
  engine?: 'sqlite' | 'postgres'
  write?: (line: string) => void
}

const usage = (hasDb: boolean, engine?: 'sqlite' | 'postgres'): string =>
  [
    'Usage: <bundle> [command]',
    '',
    '  serve            Start the server. The default when no command is given.',
    '  version          Print the version this artifact was built from.',
    '  help             Print this.',
    ...(hasDb
      ? [
          '',
          '  db migrate       Apply pending migrations to the database this build opens.',
          '  db status        List applied and pending migrations.',
          ...(engine === 'sqlite'
            ? ['  backup <path>    Copy the database to <path>, consistently.']
            : []),
        ]
      : []),
    '',
    'Environment:',
    `  ${MIGRATIONS_DIR_ENV}   Migrations directory, when not the one beside the bundle.`,
  ].join('\n')

export function parseStandaloneCommand(
  argv: string[],
  options: ParseOptions
): StandaloneCommand {
  const write = options.write ?? ((line: string) => console.log(line))
  const [command, ...rest] = argv

  if (command === undefined || command === 'serve') return { kind: 'serve' }

  if (command === 'version' || command === '--version' || command === '-v') {
    write(options.version)
    return { kind: 'exit', code: 0 }
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    write(usage(options.hasDb, options.engine))
    return { kind: 'exit', code: 0 }
  }

  const needsDb = command === 'db' || command === 'backup'
  if (needsDb && !options.hasDb) {
    write(
      `This build opens no database, so there is nothing for \`${command}\` to act on.`
    )
    return { kind: 'exit', code: 1 }
  }

  if (command === 'db') {
    const action = rest[0]
    if (action === 'migrate' || action === 'status') {
      return { kind: 'db', action }
    }
    write(
      action === undefined
        ? 'db needs an action: migrate or status.'
        : `Unknown db action: ${action}. Expected migrate or status.`
    )
    return { kind: 'exit', code: 1 }
  }

  if (command === 'backup') {
    // Postgres has pg_dump, which understands roles, extensions and large
    // objects that copying bytes out from in here would silently drop. Offering
    // the word for both engines would promise a backup on one of them that is
    // not one.
    if (options.engine !== 'sqlite') {
      write(
        'backup is for the SQLite builds, whose database is a file this process owns. Use pg_dump against DATABASE_URL.'
      )
      return { kind: 'exit', code: 1 }
    }
    const destination = rest[0]
    if (!destination) {
      write('backup needs a path to write the copy to.')
      return { kind: 'exit', code: 1 }
    }
    return { kind: 'backup', destination }
  }

  write(`Unknown command: ${command}\n\n${usage(options.hasDb, options.engine)}`)
  return { kind: 'exit', code: 1 }
}

/**
 * The migrations directory, honouring an operator who keeps them elsewhere.
 *
 * `bundleDir` is where the build put them, which is the same `db/<engine>/`
 * path Fabric's build container stages into an artifact — so an artifact from
 * either producer answers `db migrate` without being told where to look.
 */
export const resolveMigrationsDir = (
  bundleDir: string,
  env: Record<string, string | undefined> = process.env
): string => env[MIGRATIONS_DIR_ENV] ?? bundleDir

/**
 * The migration executor for whichever database this build opens.
 *
 * Both drivers are reached by dynamic import so a SQLite build never carries
 * the Postgres one into its bundle, and vice versa.
 */
const executorFor = async (
  db: StandaloneDb
): Promise<{ executor: MigrationExecutor; close: () => void }> => {
  if (db.engine === 'sqlite') {
    const { SqliteMigrationExecutor, loadSqliteRuntime } = await import(
      '@pikku/db-migrator/sqlite'
    )
    const runtime = await loadSqliteRuntime()
    const handle = runtime.open(db.databaseFile)
    return {
      executor: new SqliteMigrationExecutor(handle),
      close: () => handle.close(),
    }
  }

  const { PostgresMigrationExecutor } = await import(
    '@pikku/db-migrator/postgres'
  )
  return {
    executor: new PostgresMigrationExecutor(postgresClient(db.sql)),
    close: () => {},
  }
}

/**
 * A `PostgresMigrationClient` over the app's own postgres.js connection.
 *
 * `begin` is what makes a failed migration roll back: postgres.js hands the
 * handler a single reserved connection, so the DDL and the bookkeeping row are
 * one transaction rather than statements a pool may spread across three.
 *
 * `simple()` on the plain path is deliberate — a migration file is many
 * statements, and the extended protocol accepts only one per message.
 */
const postgresClient = (sql: PostgresSql): PostgresMigrationClient => ({
  async query<T = unknown>(text: string, params?: unknown[]) {
    const rows = (await sql.unsafe(text, params ?? [])) as T[]
    return { rows }
  },
  async exec(text: string) {
    return sql.unsafe(text).simple()
  },
  begin<T>(handler: (client: PostgresMigrationClient) => Promise<T>) {
    return sql.begin((tx) => handler(postgresClient(tx)))
  },
})

export interface CommandOutput {
  write(line: string): void
}

const stdout: CommandOutput = { write: (line) => console.log(line) }

export async function runDbCommand(
  action: 'migrate' | 'status',
  db: StandaloneDb,
  out: CommandOutput = stdout
): Promise<void> {
  const { migrate, pendingMigrations } = await import('@pikku/db-migrator')
  const { executor, close } = await executorFor(db)

  try {
    if (action === 'migrate') {
      const { applied, skipped } = await migrate(executor, db.migrationsDir)
      for (const name of applied) out.write(`applied  ${name}`)
      out.write(
        applied.length === 0
          ? `Already up to date (${skipped.length} applied previously).`
          : `Applied ${applied.length} migration(s).`
      )
      return
    }

    await executor.ensureTrackingTable()
    const applied = await executor.getApplied()
    const pending = pendingMigrations(db.migrationsDir, applied)

    for (const row of applied) {
      out.write(`applied  ${row.name}  ${row.applied_at}`)
    }
    for (const name of pending) out.write(`pending  ${name}`)
    out.write(`${applied.length} applied, ${pending.length} pending.`)
  } finally {
    close()
  }
}

/**
 * Copy the SQLite database somewhere else, while the app may be running.
 *
 * `VACUUM INTO` rather than copying the file: a plain copy taken while another
 * process is mid-write captures a torn page and a write-ahead log it has no
 * copy of, which restores as a corrupt database and only says so later.
 */
export async function runBackupCommand(
  destination: string,
  db: StandaloneSqliteDb,
  out: CommandOutput = stdout
): Promise<void> {
  const { loadSqliteRuntime } = await import('@pikku/db-migrator/sqlite')
  const runtime = await loadSqliteRuntime()
  const handle = runtime.open(db.databaseFile)
  try {
    handle.exec(`VACUUM INTO '${destination.replace(/'/g, "''")}'`)
    out.write(`Copied ${db.databaseFile} to ${destination}.`)
  } finally {
    handle.close()
  }
}

/**
 * Run whatever the argv asked for, and say whether the caller should serve.
 *
 * The database is passed already open, because the entry has to open it the one
 * way the app does — a command that resolved its own connection could migrate a
 * different database than the next `serve` reads.
 */
export async function runStandaloneCommand(
  command: StandaloneCommand,
  db: StandaloneDb | undefined,
  out: CommandOutput = stdout
): Promise<'serve' | 'done'> {
  if (command.kind === 'serve') return 'serve'
  if (command.kind === 'exit') process.exit(command.code)

  if (!db) {
    throw new Error('This build opens no database.')
  }

  if (command.kind === 'db') {
    await runDbCommand(command.action, db, out)
    return 'done'
  }

  if (db.engine !== 'sqlite') {
    throw new Error('backup is only available on a SQLite build.')
  }
  await runBackupCommand(command.destination, db, out)
  return 'done'
}
