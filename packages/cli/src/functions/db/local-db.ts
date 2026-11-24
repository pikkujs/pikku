import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, isAbsolute, relative, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { CamelCasePlugin, Kysely, PostgresDialect, sql } from 'kysely'
import type { PGlite } from '@electric-sql/pglite'
import { hasDeclaredSql, runDeclaredSql } from './declaration-probe.js'
import { traceDialect, type TraceDriverOptions } from '@pikku/kysely'
import {
  migrate,
  baselineMigrations,
  checkProbeHook,
  checkProbeLine,
  DESTRUCTIVE_MIGRATION_MARKER,
  mysqlProbeExecutor,
  postgresProbeExecutor,
  type MigrateResult,
} from '@pikku/migrator-sql'
import type { ColumnInfo, DbIntrospector } from './db-introspector.js'
import {
  applyPikkuSchemas,
  compilePikkuSchemas,
  pikkuSchemas,
  requiredPikkuSchemas,
  resolveRequirements,
  tableRequirements,
  withUserTable,
  createCoercionPlugin,
  type PikkuSchema,
  type RequiredTypes,
  type CoercionMap,
} from '@pikku/kysely'
import { loadAuthOptions, getAuthMigrations } from './better-auth-schema.js'
import { generateSchemaTypes, type CodegenResult } from './db-codegen.js'
import { generateZodTypes, type ZodCodegenResult } from './zod-codegen.js'
import {
  splitStatements,
  statementShape,
  tableCreationSql,
  tableDefinitions,
  tablesInSourceOrder,
} from '@pikku/migrator-sql'
import { APP_TABLES_SOURCE } from './migration-provenance.js'
import { tableRenameStatements } from './table-rename.js'
import {
  loadMergedDeclaration,
  type AddonDeclaration,
} from './addon-declarations.js'
import {
  declaredTableNames,
  emptyDeclaration,
  declaredTablesMarker,
  declareOnlyProblems,
  declaresOnUpdate,
  declareOnlyOnUpdateProblems,
  recordedDeclaredTables,
  refuseTableChanges,
  type DestructiveChange,
  TABLES_FILE,
  type LoadedDeclaration,
  type ColumnRename,
  type TableRename,
  type UpdateRules,
} from './table-declaration.js'
import { SqliteMigrationExecutor } from '@pikku/migrator-sql/sqlite'
import { SqliteIntrospector } from './sqlite/sqlite-introspector.js'
import { createSqliteKysely } from './sqlite/sqlite-kysely.js'
import { loadSqliteRuntime } from '@pikku/migrator-sql/sqlite'
import {
  DEFAULT_SQLITE_EXTENSIONS,
  explainMissingSqliteExtension,
  openSqlite,
  type SqliteExtensionContext,
} from './sqlite/sqlite-extensions.js'
import { wipeSqlite } from './sqlite/sqlite-wipe.js'
import { devSeed as runDevSeed, type DevSeedResult } from './sqlite/dev-seed.js'
import { PostgresMigrationExecutor } from '@pikku/migrator-sql/postgres'
import { createPGliteKysely } from './postgres/pglite-kysely.js'
import { MysqlMigrationExecutor } from '@pikku/migrator-sql/mysql'
import {
  checkChangeStatements,
  checkProbeSql,
  inlineCheckExpression,
  mysqlCheckRefusal,
  mysqlCheckSupport,
  planConstraints,
} from './check-migration.js'
import {
  sqliteConstraintNotice,
  declaredConstraints,
} from './sqlite-constraint-notice.js'
import { MysqlIntrospector } from './mysql/mysql-introspector.js'
import {
  createMysqlKysely,
  withMysqlClient,
  withScratchMysqlDatabase,
} from './mysql/mysql-client.js'
import { PostgresIntrospector } from './postgres/postgres-introspector.js'
import type { UserConfigShape } from '../commands/db-shared.js'
import { snakeCase } from './snake-case.js'

// ─── Resolved DB descriptors ─────────────────────────────────────────────────

interface ResolvedDbBase {
  rootDir: string
  migrationsDir: string
  schemaFile: string
  coercionFile: string
  manifestFile: string
  schemaJsonFile: string
  /** The annotations sidecar, compiled from the column annotations in db/tables.ts. */
  classificationsGenJsonFile: string
  /** Where the project declares its own tables, whether or not it does. */
  tablesFile: string
  enumsFile: string
  zodFile: string
  camelCase: boolean
  /**
   * Schema whose qualifier the generated types drop, from `db.defaultSchema`.
   * Unlike `schema` this applies to both dialects — sqlite has no schemas to
   * qualify with, so it is simply inert there.
   */
  defaultSchema?: string
}

export interface ResolvedSqliteDb
  extends ResolvedDbBase, SqliteExtensionContext {
  dialect: 'sqlite'
  dbFile: string
  runtimeDir: string
  devSeedFile: string
}

export interface ResolvedPostgresDb extends ResolvedDbBase {
  dialect: 'postgres'
  mode: 'url' | 'pglite'
  connectionString?: string
  pgliteDir?: string
  runtimeDir: string
  devSeedFile: string
  /**
   * Postgres extensions the embedded PGlite databases must load, as declared by
   * `db.pgliteExtensions` in the project's pikku.config.json. See
   * {@link loadPGliteExtensions}.
   *
   * Carried even in `url` mode: the shadow database the CLI migrates and
   * introspects is PGlite whichever server the project itself runs against, so
   * a migration that needs an extension needs it here too.
   */
  pgliteExtensions: string[]
  /**
   * The schema generated migrations create their tables in, from `db.schema`.
   *
   * Postgres only — hence its absence from `ResolvedSqliteDb` rather than a
   * runtime check. sqlite's `REFERENCES` clause takes a bare table name, so
   * qualified DDL does not compile there at all.
   */
  schema?: string
}

/**
 * A MySQL server, always by URL: there is no embedded MySQL to fall back to the
 * way sqlite has a file and postgres has PGlite, so a project on MySQL needs a
 * server running to migrate, generate or reset.
 */
export interface ResolvedMysqlDb extends ResolvedDbBase {
  dialect: 'mysql'
  connectionString: string
  runtimeDir: string
  devSeedFile: string
}

export type ResolvedDb = ResolvedSqliteDb | ResolvedPostgresDb | ResolvedMysqlDb

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Parse a DATABASE_URL string into the subset of UserConfigShape that resolveDb understands.
 * - postgres(ql):// → { postgresUrl }
 * - mysql:// → { mysqlUrl }
 * - libsql:// or http(s):// → {} (remote, not handled by the CLI layer)
 * - anything else → { sqliteDb } (local file path)
 */
export function parseDatabaseUrl(
  url: string
): Pick<UserConfigShape, 'sqliteDb' | 'postgresUrl' | 'mysqlUrl'> {
  if (/^postgres(ql)?:\/\//.test(url)) return { postgresUrl: url }
  if (/^mysql:\/\//.test(url)) return { mysqlUrl: url }
  if (/^(libsql|https?):\/\//.test(url)) return {}
  return { sqliteDb: url }
}

const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?)$/i

/**
 * Refuse a database that is not on this machine. Anything that cannot be read
 * as a single loopback host is refused too: `host=` in the query overrides the
 * URL's host in libpq, and a comma list is several hosts. The message names the
 * host alone, because the URL carries the password.
 */
export function assertLocalDatabase(resolved: ResolvedDb): void {
  const connectionString =
    'connectionString' in resolved ? resolved.connectionString : undefined
  if (!connectionString) return
  let url: URL | undefined
  try {
    url = new URL(connectionString)
  } catch {
    url = undefined
  }
  const local =
    url &&
    LOOPBACK_HOST.test(url.hostname) &&
    !url.searchParams.has('host') &&
    !url.searchParams.has('hostaddr')
  if (!local) {
    throw new Error(
      `Refusing to migrate a database that is not local (host: ${url?.hostname || 'unreadable'}).`
    )
  }
}

/**
 * Resolve a UserConfigShape into an absolute-path descriptor.
 * Returns null when none of sqliteDb, postgresUrl or mysqlUrl is configured.
 */
export function resolveDb(
  userConfig: UserConfigShape,
  rootDir: string,
  outDir: string,
  runtimeDir?: string,
  dbConfig?:
    | {
        schema?: string
        defaultSchema?: string
        pgliteExtensions?: string[]
        sqliteExtensions?: string[]
      }
    | string
): ResolvedDb | null {
  // The parameter took a bare schema string before `defaultSchema` existed;
  // both forms are accepted so callers outside this repo keep working.
  const schema = typeof dbConfig === 'string' ? dbConfig : dbConfig?.schema
  const defaultSchema =
    typeof dbConfig === 'string' ? undefined : dbConfig?.defaultSchema
  const resolvedRuntimeDir = runtimeDir
    ? resolveAgainst(rootDir, runtimeDir)
    : join(rootDir, '.pikku-runtime')
  const base = (sub: string): ResolvedDbBase => ({
    rootDir,
    migrationsDir: resolveAgainst(rootDir, sub),
    schemaFile: join(outDir, 'db', 'schema.gen.ts'),
    coercionFile: join(outDir, 'db', 'coercion.gen.ts'),
    manifestFile: join(outDir, 'db', 'classification.gen.ts'),
    schemaJsonFile: join(outDir, 'db', 'pikku-db-schema.gen.json'),
    enumsFile: join(outDir, 'db', 'enums.gen.ts'),
    // The sidecar lives in db/, where both readers look for it: the codegen's
    // loadAnnotations() and Studio (db/annotations.gen.json).
    classificationsGenJsonFile: join(rootDir, 'db', 'annotations.gen.json'),
    tablesFile: join(rootDir, TABLES_FILE),
    zodFile: join(outDir, 'db', 'zod.gen.ts'),
    camelCase: true,
    defaultSchema,
  })

  const configured = (
    [
      ['postgresUrl', userConfig.postgresUrl],
      ['sqliteDb', userConfig.sqliteDb],
      ['mysqlUrl', userConfig.mysqlUrl],
    ] as const
  ).filter(([, value]) => value)
  if (configured.length > 1) {
    throw new Error(
      `${configured.length === 2 ? 'Both' : 'All of'} ${configured
        .slice(0, -1)
        .map(([key]) => key)
        .join(
          ', '
        )} and ${configured.at(-1)![0]} are set. Configure exactly one database dialect.`
    )
  }

  if (userConfig.mysqlUrl) {
    if (schema) {
      throw new Error(
        `db.schema is set to '${schema}', but the resolved database is mysql. ` +
          'mysql calls a schema a database and the connection URL already names it, ' +
          'so there is no second level to qualify into. Remove db.schema, or configure postgres.'
      )
    }
    return {
      dialect: 'mysql',
      connectionString: userConfig.mysqlUrl,
      runtimeDir: resolvedRuntimeDir,
      devSeedFile: resolveAgainst(rootDir, 'db/mysql-dev-seed.sql'),
      ...base('db/mysql'),
    }
  }

  const pgliteExtensions =
    (typeof dbConfig === 'string' ? undefined : dbConfig?.pgliteExtensions) ??
    []

  if (userConfig.postgresUrl) {
    return {
      dialect: 'postgres',
      mode: 'url',
      connectionString: userConfig.postgresUrl,
      runtimeDir: resolvedRuntimeDir,
      devSeedFile: resolveAgainst(rootDir, 'db/postgres-dev-seed.sql'),
      pgliteExtensions,
      schema,
      ...base('db/postgres'),
    }
  }

  const sqliteDb =
    userConfig.sqliteDb ??
    (existsSync(join(rootDir, 'db/sqlite'))
      ? '.pikku-runtime/dev.db'
      : undefined)

  if (sqliteDb) {
    if (schema) {
      throw new Error(
        `db.schema is set to '${schema}', but the resolved database is sqlite. ` +
          'sqlite has one schema to be in, and its REFERENCES clause takes a bare ' +
          'table name, so qualified DDL does not compile there. Remove db.schema, ' +
          'or configure postgres.'
      )
    }
    return {
      dialect: 'sqlite',
      dbFile: resolveAgainst(rootDir, sqliteDb),
      runtimeDir: resolvedRuntimeDir,
      devSeedFile: resolveAgainst(rootDir, 'db/sqlite-dev-seed.sql'),
      ...sqliteExtensionContext(rootDir, dbConfig),
      ...base('db/sqlite'),
    }
  }

  if (existsSync(join(rootDir, 'db/mysql'))) {
    throw new Error(
      'db/mysql exists but no mysqlUrl is configured. MySQL has no embedded ' +
        'database to run against, so set mysqlUrl in createConfig to a server you can reach.'
    )
  }

  if (existsSync(join(rootDir, 'db/postgres'))) {
    return {
      dialect: 'postgres',
      mode: 'pglite',
      pgliteDir: join(resolvedRuntimeDir, 'dev-postgres'),
      runtimeDir: resolvedRuntimeDir,
      devSeedFile: resolveAgainst(rootDir, 'db/postgres-dev-seed.sql'),
      pgliteExtensions,
      schema,
      ...base('db/postgres'),
    }
  }

  return null
}

function sqliteExtensionContext(
  rootDir: string,
  dbConfig: Parameters<typeof resolveDb>[4]
): SqliteExtensionContext {
  const declared =
    typeof dbConfig === 'string' ? undefined : dbConfig?.sqliteExtensions
  return {
    rootDir,
    sqliteExtensions: declared ?? DEFAULT_SQLITE_EXTENSIONS,
    sqliteExtensionsDeclared: declared !== undefined,
  }
}

function resolveAgainst(root: string, p: string): string {
  return isAbsolute(p) ? p : resolve(root, p)
}

export interface PostgresQueryClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  connect?(): Promise<unknown>
  end(): Promise<void>
  exec?(sql: string): Promise<unknown>
  __connectionString?: string
  __pglite?: PGlite
}

async function createPostgresClient(
  resolved: ResolvedPostgresDb
): Promise<PostgresQueryClient> {
  if (resolved.mode === 'url') {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: resolved.connectionString })
    await client.connect()
    return Object.assign(client, {
      __connectionString: resolved.connectionString,
    })
  }

  if (!resolved.pgliteDir) {
    throw new Error('PGlite Postgres resolution is missing pgliteDir.')
  }

  mkdirSync(dirname(resolved.pgliteDir), { recursive: true })
  const db = await createEmbeddedPostgres(resolved, resolved.pgliteDir)
  return pgliteAsClient(db)
}

/**
 * What an embedded PGlite instance needs beyond its data directory: where to
 * resolve extension packages from, and which ones to load.
 *
 * A `ResolvedPostgresDb` already is one, which is what lets every call site
 * that has one pass it straight through.
 */
export interface PGliteExtensionContext {
  rootDir: string
  pgliteExtensions: string[]
}

interface EmbeddedPostgresWasm {
  pgliteWasmModule: WebAssembly.Module
  initdbWasmModule: WebAssembly.Module
}

let embeddedPostgresWasm: Promise<EmbeddedPostgresWasm | undefined> | undefined

/**
 * Compile PGlite's two WASM modules once and hand them to every instance.
 *
 * PGlite already caches them across instances internally, so this saves one
 * 10.5MB compile per process rather than one per instance — measured at ~5% off
 * a four-instance run. It is worth the few lines because a `WebAssembly.Module`
 * is stateless compiled code, safe to instantiate any number of times.
 *
 * Note what this does *not* fix: each instance still compiles ~4MB of its own
 * WASM (~3.3MB of it the pgcrypto side module, which PGlite offers no way to
 * share) across ~15 module constructions, and frees it on close. That per
 * instance churn is the suspected trigger for the rare V8 abort seen in CI on
 * Linux x64, where PKU-based ThreadIsolation loses track of a code allocation:
 *
 *   Check failed: jit_page_->allocations_.erase(addr) == 1.
 *
 * Resolution mirrors PGlite's own `new URL('./pglite.wasm', import.meta.url)`.
 * If the files are not where the package puts them (a bundled CLI, say), we
 * hand back nothing and PGlite loads them itself as before.
 */
async function loadEmbeddedPostgresWasm(): Promise<
  EmbeddedPostgresWasm | undefined
> {
  try {
    const dist = dirname(
      createRequire(import.meta.url).resolve('@electric-sql/pglite')
    )
    const [pgliteWasmModule, initdbWasmModule] = await Promise.all([
      WebAssembly.compile(readFileSync(join(dist, 'pglite.wasm'))),
      WebAssembly.compile(readFileSync(join(dist, 'initdb.wasm'))),
    ])
    return { pgliteWasmModule, initdbWasmModule }
  } catch {
    return undefined
  }
}

/**
 * A PGlite extension, as the packages that publish one export it: an object
 * carrying the `setup` that hands PGlite the WASM bundle, or a URL/string
 * pointing at a remote one.
 *
 * Structural rather than imported from PGlite so a project's extension package
 * — built against its own copy of `@electric-sql/pglite` — is recognised
 * whatever the two versions are.
 */
type PGliteExtension = { name?: string; setup: (...args: any[]) => unknown }

const isPGliteExtension = (value: unknown): value is PGliteExtension =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as PGliteExtension).setup === 'function'

/**
 * Turn a declared extension specifier into the module that publishes it.
 *
 * A bare name is one of PGlite's own contrib extensions (`hstore`, `citext`,
 * `uuid_ossp`), which ship with the CLI's copy of PGlite and need nothing
 * installed. Anything else is a package the project depends on — pgvector, say,
 * as `@electric-sql/pglite-pgvector` — so it is resolved from the project first
 * and only then from the CLI, since the project is where a user installs it.
 */
async function importPGliteExtensionModule(
  spec: string,
  rootDir: string
): Promise<Record<string, unknown>> {
  const id =
    spec.includes('/') || spec.startsWith('@')
      ? spec
      : `@electric-sql/pglite/contrib/${spec}`

  for (const from of [join(rootDir, 'package.json'), import.meta.url]) {
    let resolvedPath: string
    try {
      resolvedPath = createRequire(from).resolve(id)
    } catch {
      continue
    }
    return (await import(pathToFileURL(resolvedPath).href)) as Record<
      string,
      unknown
    >
  }

  throw new Error(
    `The PGlite extension '${spec}' could not be resolved as '${id}', ` +
      `from either the project (${rootDir}) or the pikku CLI. ` +
      `Install it in your project, or name one of PGlite's bundled contrib ` +
      `extensions (hstore, citext, uuid_ossp, …), which need no install.`
  )
}

/**
 * Load every extension the project declares, keyed the way PGlite wants them.
 *
 * The key is the export name (`vector`, `hstore`), which is also the name the
 * SQL uses, so `CREATE EXTENSION vector` finds what a declaration of
 * `@electric-sql/pglite-pgvector` loaded. A module exporting several is fine —
 * all of them are taken — and a `default` export is used only when it is the
 * only extension there, so a package that default-exports the same object it
 * also names is not registered twice.
 */
export async function loadPGliteExtensions(
  rootDir: string,
  specs: string[]
): Promise<Record<string, PGliteExtension>> {
  const extensions: Record<string, PGliteExtension> = {}

  for (const spec of specs) {
    const module = await importPGliteExtensionModule(spec, rootDir)
    const found = Object.entries(module).filter(([, value]) =>
      isPGliteExtension(value)
    ) as [string, PGliteExtension][]
    const named = found.filter(([name]) => name !== 'default')
    const chosen = named.length > 0 ? named : found

    if (chosen.length === 0) {
      throw new Error(
        `'${spec}' exports no PGlite extension. A PGlite extension is an ` +
          `object with a 'setup' function — check that the package is one, ` +
          `and that its version matches the PGlite the CLI runs.`
      )
    }

    for (const [name, extension] of chosen) {
      extensions[name === 'default' ? (extension.name ?? spec) : name] =
        extension
    }
  }

  return extensions
}

async function createEmbeddedPostgres(
  context: PGliteExtensionContext,
  dataDir?: string
): Promise<PGlite> {
  embeddedPostgresWasm ??= loadEmbeddedPostgresWasm()

  // pgvector is loaded whether or not the project declares it: retrieval over
  // embeddings is common enough that `CREATE EXTENSION vector` should just work,
  // and loading it costs nothing measurable until a migration creates it. The
  // CLI pins it to the exact PGlite it was built for (see package.json); a
  // project that declares its own copy in `pgliteExtensions` overrides this one.
  const [{ PGlite }, { pgcrypto }, { vector }, wasm, declared] =
    await Promise.all([
      import('@electric-sql/pglite'),
      import('@electric-sql/pglite/contrib/pgcrypto'),
      import('@electric-sql/pglite-pgvector'),
      embeddedPostgresWasm,
      loadPGliteExtensions(context.rootDir, context.pgliteExtensions),
    ])

  // PGlite runs Postgres as an Emscripten module, and Emscripten's exit handler
  // writes the WASM program's status straight to `process.exitCode` — booting a
  // database leaves it at 99 even though nothing failed. The CLI's bin then
  // ends with `process.exit(process.exitCode ?? 0)`, so any command that merely
  // touched the embedded database reported failure after doing all of its work
  // correctly. Restore whatever the process had before the boot.
  const exitCodeBeforeBoot = process.exitCode
  const db = new PGlite({
    ...(dataDir ? { dataDir } : {}),
    ...wasm,
    extensions: {
      pgcrypto,
      vector,
      ...declared,
    },
  })
  await db.waitReady
  if (process.exitCode !== exitCodeBeforeBoot) {
    // `?? 0` because assigning `undefined` does not clear an already-set
    // exitCode under bun, which is the runtime the boot pollutes it on.
    process.exitCode = exitCodeBeforeBoot ?? 0
  }
  return db
}

/**
 * PGlite reports an extension it was never given as a plain
 * `extension "x" is not available`, which reads as though the SQL is at fault.
 * It is not: the database is real Postgres, the migration is fine, and the one
 * thing missing is the declaration that would have loaded the extension into
 * this particular instance. Say so, since nothing else in the message points
 * anywhere near the fix.
 */
function explainMissingExtension(error: unknown, declared: string[]): unknown {
  const message = error instanceof Error ? error.message : ''
  const match = /extension "([^"]+)" is not available/.exec(message)
  if (!match) return error

  const name = match[1]
  return new Error(
    `The embedded PGlite database has no '${name}' extension. ` +
      `The CLI migrates a PGlite shadow database to type and diff your schema, ` +
      `so every extension your migrations use, other than pgcrypto and vector ` +
      `(pgvector), which are always loaded, has to be declared as ` +
      `db.pgliteExtensions in pikku.config.json — e.g. "db": { "pgliteExtensions": ["${name}"] } ` +
      `for a PGlite contrib extension, or the package that publishes it.` +
      (declared.length > 0
        ? ` Currently declared: ${declared.join(', ')}.`
        : ''),
    { cause: error }
  )
}

function pgliteAsClient(db: PGlite): PostgresQueryClient {
  return {
    query: (sql: string, params?: unknown[]) => db.query(sql, params),
    exec: (sql: string) => db.exec(sql),
    __pglite: db,
    end: async () => {
      if (!db.closed) {
        await db.close()
      }
    },
  }
}

export async function withPostgresClient<T>(
  resolved: ResolvedPostgresDb,
  run: (client: PostgresQueryClient) => Promise<T>
): Promise<T> {
  const client = await createPostgresClient(resolved)
  try {
    return await run(client)
  } catch (error) {
    // Only the embedded database's missing extensions are the declaration's
    // doing. On a real server it is the server that lacks the extension, and
    // pointing at the CLI's config would send the reader the wrong way.
    throw resolved.mode === 'pglite'
      ? explainMissingExtension(error, resolved.pgliteExtensions)
      : error
  } finally {
    await client.end()
  }
}

async function loadCoercionPlugin(
  coercionFile: string
): Promise<CoercionMap | undefined> {
  try {
    const mod = await import(coercionFile)
    return mod.coercionMap as CoercionMap
  } catch {
    return undefined
  }
}

// ─── Migrate + codegen ────────────────────────────────────────────────────────

export interface MigrateAndCodegenOutcome {
  migrate: MigrateResult
  codegen: CodegenResult
  zod: ZodCodegenResult
  classificationsJsonWritten: boolean
}

/**
 * A replay of the migrations onto a throwaway database, to read what they
 * define. Nothing there to lose, so a destructive one is no reason to stop.
 */
const REPLAY = { allowDestructive: true }

export interface MigrateAndCodegenOptions {
  /**
   * The addons the project wires, whose declared tables join its own. Left out
   * by a caller with no inspector state (`pikku all` generating a first set of
   * types), the annotations written are the app's alone until the next
   * `db migrate`.
   */
  addons?: AddonDeclaration[]
  /** Apply migrations marked `-- pikku:destructive` to the configured database. */
  allowDestructive?: boolean
  /**
   * Apply the migrations to a throwaway database and introspect that, instead
   * of touching the configured one.
   *
   * The generated types describe the schema the migrations define, which is the
   * contract — a live database additionally carries whatever has drifted into
   * it (tables a runtime bootstrapped, leftovers from a reverted branch), and
   * introspecting one makes codegen depend on a reachable, already-migrated
   * server. That ordering is the problem this solves: codegen can now run
   * before deploy-time migrations, on a machine with no database at all.
   *
   * SQLite uses `:memory:`; Postgres uses an embedded PGlite (real Postgres,
   * and it needs no `CREATEDB` privilege anywhere). MySQL has nothing embedded,
   * so it creates and drops a database on the configured server.
   */
  scratch?: boolean
}

export async function migrateAndCodegen(
  resolved: ResolvedDb,
  options: MigrateAndCodegenOptions = {}
): Promise<MigrateAndCodegenOutcome> {
  let migrateResult!: MigrateResult
  let codegenResult!: CodegenResult
  // A scratch database holds nothing to lose; the configured one does.
  const applying = {
    allowDestructive: options.scratch || options.allowDestructive,
  }

  const declaration = await loadMergedDeclaration(
    resolved.rootDir,
    options.addons
  )

  // Codegen reads the sidecar, so it is written first.
  const classificationsJsonWritten = writeAnnotationsSidecar(
    resolved.classificationsGenJsonFile,
    declaration
  )

  if (resolved.dialect === 'sqlite') {
    if (!options.scratch) {
      mkdirSync(dirname(resolved.dbFile), { recursive: true })
    }
    const db = await openSqlite(
      resolved,
      options.scratch ? ':memory:' : resolved.dbFile
    )
    try {
      const executor = new SqliteMigrationExecutor(db)
      try {
        migrateResult = await migrate(
          executor,
          resolved.migrationsDir,
          applying
        )
      } catch (error) {
        throw explainMissingSqliteExtension(error, resolved)
      }
      const introspector = new SqliteIntrospector(db)
      codegenResult = await generateSchemaTypes(introspector, {
        outFile: resolved.schemaFile,
        coercionFile: resolved.coercionFile,
        manifestFile: resolved.manifestFile,
        schemaJsonFile: resolved.schemaJsonFile,
        enumsFile: resolved.enumsFile,
        camelCase: resolved.camelCase,
        defaultSchema: resolved.defaultSchema,
        rootDir: resolved.rootDir,
        dialect: 'sqlite',
        migrationsDir: resolved.migrationsDir,
      })
    } finally {
      db.close()
    }
  } else if (resolved.dialect === 'mysql') {
    const withClient = options.scratch
      ? withScratchMysqlDatabase
      : withMysqlClient
    await withClient(resolved, async (client) => {
      const introspector = new MysqlIntrospector(client)
      migrateResult = await migrate(
        new MysqlMigrationExecutor(client),
        resolved.migrationsDir,
        {
          ...applying,
          // The configured database has rows a new check has to hold for.
          beforeMigration: options.scratch
            ? undefined
            : checkProbeHook('mysql', mysqlProbeExecutor(client)),
        }
      )
      codegenResult = await generateSchemaTypes(introspector, {
        outFile: resolved.schemaFile,
        coercionFile: resolved.coercionFile,
        manifestFile: resolved.manifestFile,
        schemaJsonFile: resolved.schemaJsonFile,
        enumsFile: resolved.enumsFile,
        camelCase: resolved.camelCase,
        defaultSchema: resolved.defaultSchema,
        rootDir: resolved.rootDir,
        dialect: 'mysql',
        migrationsDir: resolved.migrationsDir,
      })
    })
  } else {
    const withClient = options.scratch
      ? <T>(
          r: ResolvedPostgresDb,
          run: (c: PostgresQueryClient) => Promise<T>
        ) => withScratchPostgresDatabase(r, run)
      : withPostgresClient
    await withClient(resolved, async (client) => {
      const introspector = new PostgresIntrospector(client)
      await introspector.connect()
      try {
        const executor = new PostgresMigrationExecutor(client)
        migrateResult = await migrate(executor, resolved.migrationsDir, {
          ...applying,
          beforeMigration: options.scratch
            ? undefined
            : checkProbeHook('postgres', postgresProbeExecutor(client)),
        })
        codegenResult = await generateSchemaTypes(introspector, {
          outFile: resolved.schemaFile,
          coercionFile: resolved.coercionFile,
          manifestFile: resolved.manifestFile,
          schemaJsonFile: resolved.schemaJsonFile,
          enumsFile: resolved.enumsFile,
          camelCase: resolved.camelCase,
          defaultSchema: resolved.defaultSchema,
          rootDir: resolved.rootDir,
          dialect: 'postgres',
          migrationsDir: resolved.migrationsDir,
        })
      } finally {
        await introspector.close()
      }
    })
  }

  const zodResult = generateZodTypes({
    schemaFile: resolved.schemaFile,
    outFile: resolved.zodFile,
    formats: codegenResult.zodFormats,
    constraints: codegenResult.zodConstraints,
    serverSet: codegenResult.zodServerSet,
  })

  return {
    migrate: migrateResult,
    codegen: codegenResult,
    zod: zodResult,
    classificationsJsonWritten,
  }
}

// ─── SQLite-only operations ───────────────────────────────────────────────────

/**
 * Apply the dev seed file. Only {@link reset} calls this, immediately after
 * migrating a database it has just wiped, which is what lets a seed file be
 * plain `INSERT`s rather than idempotent ones.
 *
 * `reset` refuses production before it gets here, so this guard is unreachable
 * through the CLI. It stays because the export is reachable without it.
 */
export async function devSeed(resolved: ResolvedDb): Promise<DevSeedResult> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `pikku dev seed refused: NODE_ENV=production. Seed data is test data — it only runs in dev.`
    )
  }

  if (resolved.dialect === 'sqlite') {
    const db = await openSqlite(resolved, resolved.dbFile)
    try {
      return runDevSeed(db, resolved.devSeedFile)
    } catch (error) {
      throw explainMissingSqliteExtension(error, resolved)
    } finally {
      db.close()
    }
  }

  if (!existsSync(resolved.devSeedFile)) {
    return { applied: false, bytes: 0 }
  }

  const sql = readFileSync(resolved.devSeedFile, 'utf8')
  if (sql.trim().length === 0) {
    return { applied: false, bytes: 0 }
  }

  const run = async (client: {
    exec?: (sql: string) => Promise<unknown>
    query: (sql: string) => Promise<unknown>
  }) => {
    if (typeof client.exec === 'function') {
      await client.exec(sql)
    } else {
      await client.query(sql)
    }
  }
  if (resolved.dialect === 'mysql') {
    await withMysqlClient(resolved, run)
  } else {
    await withPostgresClient(resolved, run)
  }

  return { applied: true, bytes: Buffer.byteLength(sql) }
}

export async function reset(
  resolved: ResolvedDb,
  rootDir: string
): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `pikku db reset refused: NODE_ENV=production. This command only runs in dev.`
    )
  }

  if (resolved.dialect === 'sqlite') {
    const rel = relative(resolved.runtimeDir, resolved.dbFile)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(
        `pikku db reset refused: resolved DB file (${resolved.dbFile}) is outside the runtime directory (${resolved.runtimeDir}). Override sqliteDb or set runtimeDir correctly.`
      )
    }
    await wipeSqlite(resolved, resolved.dbFile)
    return
  }

  if (resolved.dialect === 'mysql') {
    await withMysqlClient(resolved, async (client) => {
      const { rows } = await client.query<{ table_name: string }>(
        `SELECT table_name AS table_name FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`
      )
      if (rows.length === 0) return
      await client.exec(
        `SET FOREIGN_KEY_CHECKS = 0; DROP TABLE ${rows.map((r) => quoteMysqlIdentifier(r.table_name)).join(', ')}; SET FOREIGN_KEY_CHECKS = 1`
      )
    })
    return
  }

  if (resolved.mode === 'pglite') {
    if (!resolved.pgliteDir) {
      throw new Error('PGlite Postgres resolution is missing pgliteDir.')
    }
    const rel = relative(resolved.runtimeDir, resolved.pgliteDir)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(
        `pikku db reset refused: resolved PGlite dir (${resolved.pgliteDir}) is outside the runtime directory (${resolved.runtimeDir}).`
      )
    }
    if (existsSync(resolved.pgliteDir)) {
      rmSync(resolved.pgliteDir, { recursive: true, force: true })
    }
    return
  }

  await withPostgresClient(resolved, async (client) => {
    const result = await client.query<{ schema_name: string }>(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
        AND schema_name NOT LIKE 'pg_toast%'
        AND schema_name NOT LIKE 'pg_temp_%'
    `)

    for (const { schema_name: schemaName } of result.rows) {
      await client.query(
        `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`
      )
    }

    await client.query('CREATE SCHEMA IF NOT EXISTS public')
  })
}

// ── Annotations sidecar ───────────────────────────────────────────────────────

/**
 * Write the column annotations `db/tables.ts` declares to the
 * `annotations.gen.json` sidecar that the codegen and Studio
 * read. With no declaration there is nothing to annotate, so a sidecar left
 * from an earlier run is removed rather than kept classifying columns nothing
 * declares. Returns whether the sidecar changed on disk.
 */
function writeAnnotationsSidecar(
  genJsonFile: string,
  declaration: LoadedDeclaration | null
): boolean {
  const existing = existsSync(genJsonFile)
    ? readFileSync(genJsonFile, 'utf8')
    : null
  if (!declaration) {
    if (existing === null) return false
    rmSync(genJsonFile)
    return true
  }
  const next = JSON.stringify(declaration.annotations, null, 2) + '\n'
  if (existing === next) return false
  mkdirSync(dirname(genJsonFile), { recursive: true })
  writeFileSync(genJsonFile, next, 'utf8')
  return true
}

/**
 * `tracing` records db spans for the SQLite and Postgres-by-URL paths a served
 * project uses; MySQL and the embedded PGlite are not wrapped.
 */
export async function createKysely<DB>(
  resolved: ResolvedDb,
  tracing?: Omit<TraceDriverOptions, 'system'>
): Promise<Kysely<DB>> {
  const coercionMap = await loadCoercionPlugin(resolved.coercionFile)
  const plugins = coercionMap
    ? [createCoercionPlugin({ map: coercionMap })]
    : []

  if (resolved.dialect === 'sqlite') {
    mkdirSync(dirname(resolved.dbFile), { recursive: true })
    return createSqliteKysely<DB>({
      db: await openSqlite(resolved, resolved.dbFile),
      camelCase: resolved.camelCase,
      plugins,
      tracing,
    })
  }

  if (resolved.dialect === 'mysql') {
    return createMysqlKysely<DB>({
      url: resolved.connectionString,
      camelCase: resolved.camelCase,
      plugins,
    })
  }

  if (resolved.mode === 'url') {
    const { Pool } = await import('pg')
    const pool = new Pool({
      connectionString: resolved.connectionString,
      max: 10,
    })
    return new Kysely<DB>({
      dialect: traceDialect(new PostgresDialect({ pool }), {
        ...tracing,
        system: 'postgresql',
      }),
      plugins: resolved.camelCase
        ? [new CamelCasePlugin(), ...plugins]
        : plugins,
    })
  }

  if (!resolved.pgliteDir) {
    throw new Error('PGlite Postgres resolution is missing pgliteDir.')
  }

  mkdirSync(dirname(resolved.pgliteDir), { recursive: true })
  return createPGliteKysely<DB>({
    db: await createEmbeddedPostgres(resolved, resolved.pgliteDir),
    camelCase: resolved.camelCase,
    plugins,
  })
}

/**
 * Every table and its columns, keyed by the name the introspector reports.
 *
 * Carries the whole {@link ColumnInfo}, not just the names, because the same
 * map has to answer both "does this column exist" and "what would the statement
 * that adds it look like" — and a map of names can only answer the first.
 */
type SchemaMap = Map<string, Map<string, ColumnInfo>>

async function introspectorToMap(intro: DbIntrospector): Promise<SchemaMap> {
  const map: SchemaMap = new Map()
  for (const [table, cols] of await intro.getAllColumns()) {
    map.set(table, new Map(cols.map((c) => [c.name, c])))
  }
  return map
}

/**
 * The tables and columns `desired` has that `actual` does not.
 *
 * `schema` is the one the desired bare names belong in, when the caller knows.
 * Given it, only that schema's copy of a table counts: a `workflow_step` in
 * `public` is a different table from the `app.workflow_step` a source with
 * `db.schema: "app"` wants, and letting it match would report the source
 * satisfied by a table its SQL never creates.
 */
function diffSchemas(
  desired: SchemaMap,
  actual: SchemaMap,
  schema?: string
): {
  missingTables: string[]
  missingColumns: { table: string; columns: string[] }[]
} {
  const missingTables: string[] = []
  const missingColumns: { table: string; columns: string[] }[] = []

  for (const [table, cols] of desired) {
    const actualCols = schema
      ? actual.get(qualifiedTableKey(schema, table))
      : (actual.get(table) ?? schemaQualifiedMatch(actual, table))
    if (!actualCols) {
      missingTables.push(table)
      continue
    }
    const missing = [...cols.keys()].filter((c) => !actualCols.has(c))
    if (missing.length) missingColumns.push({ table, columns: missing })
  }
  return { missingTables, missingColumns }
}

/**
 * Columns the migrations gave a table that its source no longer declares, and
 * that no insert can satisfy: NOT NULL, no default, not a key. The source wrote
 * them once (Better Auth 1.7.0–1.7.2 required `account.issuer`; 1.7.3 stopped
 * writing it), so they are in the covered schema, and every insert into the table
 * fails until they are relaxed. `diffSchemas` cannot see this — it only looks for
 * what is missing — so a source that is otherwise "already covered" stays broken.
 */
function orphanedRequiredColumns(
  desired: SchemaMap,
  actual: SchemaMap,
  schema?: string
): { table: string; columns: ColumnInfo[] }[] {
  const orphans: { table: string; columns: ColumnInfo[] }[] = []
  for (const [table, cols] of desired) {
    const actualCols = schema
      ? actual.get(qualifiedTableKey(schema, table))
      : (actual.get(table) ?? schemaQualifiedMatch(actual, table))
    if (!actualCols) continue
    const columns = [...actualCols.values()].filter(
      (c) =>
        !cols.has(c.name) &&
        c.notNull &&
        c.defaultValue === null &&
        !c.pk &&
        !c.generated
    )
    if (columns.length) orphans.push({ table, columns })
  }
  return orphans
}

/**
 * How an introspected schema map keys a table in a given schema.
 *
 * Introspection elides `public`, so the key for a table there is the bare name.
 * Anything else carries its qualifier.
 */
function qualifiedTableKey(schema: string, table: string): string {
  return schema === 'public' ? table : `${schema}.${table}`
}

/** A MySQL identifier, backtick-quoted. */
function quoteMysqlIdentifier(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``
}

/** A PostgreSQL identifier, quoted so its casing survives the parser. */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * The one table in `actual` whose name matches `table` once its schema is
 * dropped, if there is exactly one.
 *
 * A migration that names no schema lands in whichever one is default, so a bare
 * desired name legitimately matches a qualified table. Only when it is
 * unambiguous: two candidates mean the shadowing bug, not a match.
 */
function schemaQualifiedMatch(
  actual: SchemaMap,
  table: string
): Map<string, ColumnInfo> | undefined {
  if (table.includes('.')) return undefined
  const matches = [...actual.entries()].filter(([actualTable]) => {
    const parts = actualTable.split('.')
    return parts.length === 2 && parts[1] === table
  })
  if (matches.length !== 1) return undefined
  return matches[0][1]
}

/**
 * A schema somebody other than the project's own migrations defines — Better
 * Auth or the pikku runtime.
 *
 * Every such source answers the same two questions, which is what lets one
 * mechanism serve all of them: `tables` is what must exist, and `sql` is what
 * creates it.
 */
export interface DesiredSchema {
  tables: SchemaMap
  sql: string
}

export type DesiredAuthSchema = DesiredSchema

function isPostgresAuthDatabase(options: {
  database?: { type?: string }
}): boolean {
  return options.database?.type === 'postgres'
}

function isMysqlAuthDatabase(options: {
  database?: { type?: string }
}): boolean {
  return options.database?.type === 'mysql'
}

// The scratch database is a throwaway used only to compute the desired Better
// Auth schema and the migration-covered schema for drift detection. We always
// use an in-memory PGlite instance for it — PGlite is real Postgres, so the
// introspection stays accurate, and it needs no `CREATEDB` privilege on the
// target server. Creating a real database via `CREATE DATABASE` would require
// elevated privileges that application roles (correctly) don't have, which made
// `pikku db migrate` fail against managed/locked-down Postgres (error 42501).
async function withScratchPostgresDatabase<T>(
  context: PGliteExtensionContext,
  run: (scratchDb: PostgresQueryClient) => Promise<T>
): Promise<T> {
  const scratchDb = await createEmbeddedPostgres(context)
  try {
    return await run(pgliteAsClient(scratchDb))
  } catch (error) {
    throw explainMissingExtension(error, context.pgliteExtensions)
  } finally {
    if (!scratchDb.closed) {
      await scratchDb.close()
    }
  }
}

async function postgresDatabaseToMap(
  client: PostgresQueryClient
): Promise<SchemaMap> {
  const intro = new PostgresIntrospector(client)
  await intro.connect()
  try {
    return await introspectorToMap(intro)
  } finally {
    await intro.close()
  }
}

async function desiredPostgresAuthSchema(
  context: PGliteExtensionContext,
  rootDir: string,
  sourceDirs: string[],
  logger: { error: (msg: string) => void }
): Promise<DesiredAuthSchema | null> {
  return withScratchPostgresDatabase(context, async (scratchDb) => {
    // The scratch DB is always an embedded PGlite instance (see
    // withScratchPostgresDatabase), so drive Better Auth's migration codegen
    // through the PGlite-backed Kysely regardless of how the app DB is
    // configured.
    const kysely = createPGliteKysely<any>({
      db: scratchDb.__pglite!,
      camelCase: true,
    })

    try {
      const options = await loadAuthOptions({
        rootDir,
        sourceDirs,
        kysely,
        logger,
      })
      if (!options) return null

      const { runMigrations, compileMigrations } = await getAuthMigrations(
        options,
        'postgres'
      )
      await runMigrations()
      const tables = await postgresDatabaseToMap(scratchDb)
      const sql = await compileMigrations()
      return { tables, sql }
    } finally {
      await kysely.destroy()
    }
  })
}

async function desiredMysqlAuthSchema(
  resolved: ResolvedMysqlDb,
  rootDir: string,
  sourceDirs: string[],
  logger: { error: (msg: string) => void }
): Promise<DesiredAuthSchema | null> {
  return withScratchMysqlDatabase(resolved, async (scratchDb) => {
    const kysely = await createMysqlKysely<any>({ url: scratchDb.url })
    try {
      const options = await loadAuthOptions({
        rootDir,
        sourceDirs,
        kysely,
        logger,
      })
      if (!options) return null

      const { runMigrations, compileMigrations } = await getAuthMigrations(
        options,
        'mysql'
      )
      await runMigrations()
      const tables = await introspectorToMap(new MysqlIntrospector(scratchDb))
      const sql = await compileMigrations()
      return { tables, sql }
    } finally {
      await kysely.destroy()
    }
  })
}

export async function desiredAuthSchema(
  resolved: ResolvedDb,
  rootDir: string,
  sourceDirs: string[],
  logger: { error: (msg: string) => void }
): Promise<DesiredAuthSchema | null> {
  const runtime = await loadSqliteRuntime()
  const db = runtime.open(':memory:')
  try {
    const kysely = createSqliteKysely({ db, camelCase: true })
    const options = await loadAuthOptions({
      rootDir,
      sourceDirs,
      kysely,
      logger,
    })
    if (!options) return null
    // The resolved database decides, not what the auth factory declared: a
    // starter's `type: 'sqlite'` must not send a MySQL project down the SQLite
    // path (see getAuthMigrations). A factory that declares a server dialect the
    // project is not on is still an error.
    if (resolved.dialect === 'mysql') {
      return desiredMysqlAuthSchema(resolved, rootDir, sourceDirs, logger)
    }
    if (isMysqlAuthDatabase(options)) {
      throw new Error(
        'Better Auth database.type is mysql, but the resolved app database is not mysql.'
      )
    }
    if (resolved.dialect === 'postgres') {
      return desiredPostgresAuthSchema(resolved, rootDir, sourceDirs, logger)
    }
    if (isPostgresAuthDatabase(options)) {
      throw new Error(
        'Better Auth database.type is postgres, but the resolved app database is not postgres.'
      )
    }
    const { runMigrations, compileMigrations } = await getAuthMigrations(
      options,
      'sqlite'
    )
    await runMigrations()
    const tables = await introspectorToMap(new SqliteIntrospector(db))
    const sql = await compileMigrations()
    return { tables, sql }
  } finally {
    db.close()
  }
}

/**
 * Run Better Auth's own migrator against `kysely`, if the project configures it.
 *
 * Separate from `desiredAuthSchema` because the auth tables are a prerequisite
 * of the runtime ones, not just a peer of them: both have to land in the same
 * throwaway database, in that order, for the scope tables' foreign keys onto
 * `user.id` to resolve.
 */
async function applyAuthSchema(
  kysely: Kysely<any>,
  rootDir: string,
  sourceDirs: string[],
  logger: { error: (msg: string) => void },
  dialect: 'sqlite' | 'postgres' | 'mysql'
): Promise<{ userTable: string } | null> {
  const options = await loadAuthOptions({
    rootDir,
    sourceDirs,
    kysely,
    logger,
  })
  if (!options) return null
  const { runMigrations } = await getAuthMigrations(options, dialect)
  await runMigrations()
  const user = options.user as { modelName?: unknown } | undefined
  return {
    userTable:
      typeof user?.modelName === 'string' && user.modelName
        ? snakeCase(user.modelName)
        : 'user',
  }
}

/** A runtime schema left out because nothing in the project creates what it needs. */
export interface SkippedRuntimeSchema {
  schema: string
  /** The prerequisite that was not there, as `table.column`. */
  requires: string
  owner: string
}

export interface DesiredRuntimeSchema extends DesiredSchema {
  skipped: SkippedRuntimeSchema[]
}

/**
 * The tables `@pikku/kysely`'s runtime services need, as declared.
 *
 * Materialized the same way the auth schema is: applied to a throwaway database
 * and introspected, so one declaration answers both "what should exist" and
 * "what SQL creates it" without a hand-written per-dialect copy.
 *
 * Auth goes into the same database first, because it is a prerequisite — the
 * scope tables grant to a user, so they reference the table Better Auth owns.
 * Its tables are subtracted from the result: they are covered by auth's own
 * source, and counting them twice would have `db generate` write them twice.
 *
 * A project with no auth configured is not an error here. It genuinely has no
 * scope tables, so the schemas that wanted them are left out and returned in
 * `skipped` — reported rather than dropped, because the tables they would have
 * recognised now have nothing to explain them.
 *
 * `services` narrows the declaration to the schemas the services a project's
 * code actually reaches own, for the caller that is about to write a migration:
 * a project with no agents should not carry `agent_threads` in its migrations
 * forever. Omit it and the whole declaration answers, which is what the caller
 * that is *recognising* tables wants — a table created by a service that has
 * since been dropped still has to read as a runtime table rather than as an
 * unexplained one.
 */
export async function desiredRuntimeSchema(
  resolved: ResolvedDb,
  rootDir: string,
  sourceDirs: string[],
  logger: { error: (msg: string) => void },
  services?: ReadonlySet<string>
): Promise<DesiredRuntimeSchema> {
  const declared = services ? requiredPikkuSchemas(services) : pikkuSchemas
  const skipped: SkippedRuntimeSchema[] = []

  const collect = async (
    db: Kysely<any>,
    introspect: () => Promise<SchemaMap>
  ): Promise<{
    tables: SchemaMap
    schemas: PikkuSchema[]
    types: RequiredTypes
  }> => {
    const auth = await applyAuthSchema(
      db,
      rootDir,
      sourceDirs,
      logger,
      resolved.dialect
    )
    const userTable = auth?.userTable ?? 'user'
    const before = await introspect()

    const mapped = withUserTable(declared, userTable)
    const { types, unmet } = await resolveRequirements(db, mapped)
    if (resolved.dialect === 'mysql' && types[`${userTable}.id`]) {
      // The scratch database holds Better Auth's own `id` (text); the project's
      // real users table (a Rails `bigint`, say) comes from its migrations. A
      // foreign key has to match the table it points at, so the migrations win.
      try {
        const real = (await coveredSchema(resolved))
          .get(userTable)
          ?.get('id')?.type
        if (real) types[`${userTable}.id`] = real
      } catch {
        // No migrations to read yet: the scratch type is the best answer.
      }
    }
    for (const { schema, requirement } of unmet) {
      skipped.push({
        schema: schema.name,
        requires: `${requirement.table}.${requirement.column}`,
        owner: requirement.owner,
      })
    }
    const unavailable = new Set(unmet.map(({ schema }) => schema.name))
    const schemas = mapped.filter((s) => !unavailable.has(s.name))

    await applyPikkuSchemas(db, schemas)
    const after = await introspect()
    for (const table of before.keys()) after.delete(table)
    return { tables: after, schemas, types }
  }

  return withThrowawayKysely(resolved, async (kysely, introspect) => {
    const { tables, schemas, types } = await collect(kysely, introspect)
    return {
      tables,
      sql: compilePikkuSchemas(
        kysely,
        schemas,
        types,
        resolved.dialect === 'postgres' ? resolved.schema : undefined
      ),
      skipped,
    }
  })
}

/**
 * Run `work` against an empty database of the project's dialect, thrown away
 * afterwards.
 *
 * What lets one declaration answer for every engine: the sources that declare
 * rather than ship SQL apply themselves here and read back what they created.
 * SQLite and Postgres are embedded, so nothing is touched; MySQL has nothing
 * embedded and creates a scratch database on the configured server.
 */
async function withThrowawayKysely<T>(
  resolved: ResolvedDb,
  work: (db: Kysely<any>, introspect: () => Promise<SchemaMap>) => Promise<T>
): Promise<T> {
  if (resolved.dialect === 'sqlite') {
    const runtime = await loadSqliteRuntime()
    const db = runtime.open(':memory:')
    try {
      return await work(createSqliteKysely({ db, camelCase: true }), () =>
        introspectorToMap(new SqliteIntrospector(db))
      )
    } finally {
      db.close()
    }
  }

  if (resolved.dialect === 'mysql') {
    return withScratchMysqlDatabase(resolved, async (db) => {
      const kysely = await createMysqlKysely<any>({ url: db.url })
      try {
        return await work(kysely, () =>
          introspectorToMap(new MysqlIntrospector(db))
        )
      } finally {
        await kysely.destroy()
      }
    })
  }

  return withScratchPostgresDatabase(resolved, async (db) => {
    const kysely = createPGliteKysely<any>({
      db: db.__pglite!,
      camelCase: true,
    })
    try {
      return await work(kysely, () => postgresDatabaseToMap(db))
    } finally {
      await kysely.destroy()
    }
  })
}

export async function introspectSchema(
  resolved: ResolvedDb
): Promise<SchemaMap> {
  if (resolved.dialect === 'sqlite') {
    const db = await openSqlite(resolved, resolved.dbFile)
    try {
      return await introspectorToMap(new SqliteIntrospector(db))
    } finally {
      db.close()
    }
  }
  if (resolved.dialect === 'mysql') {
    return withMysqlClient(resolved, (client) =>
      introspectorToMap(new MysqlIntrospector(client))
    )
  }
  return withPostgresClient(resolved, async (client) => {
    const intro = new PostgresIntrospector(client)
    await intro.connect()
    try {
      return await introspectorToMap(intro)
    } finally {
      await intro.close()
    }
  })
}

async function coveredSqliteSchema(
  migrationsDir: string,
  context: SqliteExtensionContext,
  indexes?: Map<string, string[]>
): Promise<SchemaMap> {
  const db = await openSqlite(context, ':memory:')
  try {
    try {
      await migrate(new SqliteMigrationExecutor(db), migrationsDir, REPLAY)
    } catch (error) {
      throw explainMissingSqliteExtension(error, context)
    }
    const map = await introspectorToMap(new SqliteIntrospector(db))
    if (indexes) collectSqliteColumnIndexes(db, map, indexes)
    return map
  } finally {
    db.close()
  }
}

/**
 * Which explicit indexes cover each column, keyed `table.column`. SQLite refuses
 * to drop a column an index names, so the migration that drops one has to drop
 * those first. Only `CREATE INDEX` ones (origin `c`): a column with a UNIQUE or
 * PRIMARY KEY constraint cannot be dropped at all, and is left alone.
 */
function collectSqliteColumnIndexes(
  db: { prepare(sql: string): { all(): unknown[] } },
  schema: SchemaMap,
  out: Map<string, string[]>
): void {
  for (const table of schema.keys()) {
    const list = db
      .prepare(`PRAGMA index_list(${JSON.stringify(table)})`)
      .all() as { name: string; origin: string }[]
    for (const index of list) {
      if (index.origin !== 'c') continue
      const info = db
        .prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`)
        .all() as { name: string | null }[]
      for (const col of info) {
        if (!col.name) continue
        const key = `${table}.${col.name}`
        out.set(key, [...(out.get(key) ?? []), index.name])
      }
    }
  }
}

async function coveredMysqlSchema(
  migrationsDir: string,
  resolved: Pick<ResolvedMysqlDb, 'connectionString'>,
  refuseDanglingKeys = false
): Promise<SchemaMap> {
  return withScratchMysqlDatabase(resolved, async (client) => {
    await migrate(new MysqlMigrationExecutor(client), migrationsDir, REPLAY)
    if (refuseDanglingKeys) {
      // The migrator turns FOREIGN_KEY_CHECKS off, which lets a table that other
      // tables point at be dropped and leaves their keys pointing at nothing.
      const { rows } = await client.query(
        `SELECT table_name AS child, referenced_table_name AS parent
         FROM information_schema.key_column_usage
         WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL
           AND referenced_table_name NOT IN (
             SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE())`
      )
      const [first] = rows as { child: string; parent: string }[]
      if (first) {
        throw new Error(
          `${first.child} still has a foreign key to ${first.parent}, which this drops. ` +
            `Drop or change the table that points at it first, in the same declaration or by hand`
        )
      }
    }
    return introspectorToMap(new MysqlIntrospector(client))
  })
}

/** The schema the migrations alone define, on whichever dialect `resolved` is. */
async function coveredSchema(
  resolved: ResolvedDb,
  columnIndexes?: Map<string, string[]>,
  refuseDanglingKeys = false
): Promise<SchemaMap> {
  switch (resolved.dialect) {
    case 'sqlite':
      return coveredSqliteSchema(
        resolved.migrationsDir,
        resolved,
        columnIndexes
      )
    case 'mysql':
      return coveredMysqlSchema(
        resolved.migrationsDir,
        resolved,
        refuseDanglingKeys
      )
    case 'postgres':
      return coveredPostgresSchema(resolved.migrationsDir, resolved)
  }
}

async function coveredPostgresSchema(
  migrationsDir: string,
  context: PGliteExtensionContext
): Promise<SchemaMap> {
  return withScratchPostgresDatabase(context, async (client) => {
    await migrate(new PostgresMigrationExecutor(client), migrationsDir, REPLAY)
    return postgresDatabaseToMap(client)
  })
}

export interface SchemaDriftResult {
  /** In the migrations, absent from the database — it is behind. */
  missingTables: string[]
  missingColumns: { table: string; columns: string[] }[]
  /**
   * In the database and absent from the migrations, but declared by the pikku
   * runtime — created by a service at boot rather than written down.
   */
  runtimeTables: string[]
  /** In the database, absent from the migrations — nobody wrote it down. */
  extraTables: string[]
  /**
   * Runtime schemas that could not be materialized, so their tables were not
   * recognisable — the reason an `extraTables` entry may be a runtime table in
   * disguise.
   */
  skippedRuntimeSchemas: SkippedRuntimeSchema[]
  inSync: boolean
}

/**
 * Compare the schema the migration files define against the one the configured
 * database actually has.
 *
 * The two halves are asymmetric and must stay that way. Something missing from
 * the database is a database that is behind — the fix only ever adds, so it is
 * safe to automate. Something present in the database but absent from the
 * migrations is a table nobody wrote down: a runtime that created its own at
 * boot, or the remains of a reverted branch. Dropping those is how data gets
 * lost, so they are reported and never acted on.
 *
 * The pikku runtime declares tables of its own, and they are used here to
 * recognise rather than to require. A project that never constructs the
 * workflow or AI services should not be told it is missing their tables, so
 * absence is not a finding. Presence is: a runtime table in the database that
 * no migration creates gets reported as such, separately from the genuinely
 * unexplained ones, because for those the remedy is known — `db generate`
 * writes them down.
 */
export async function computeSchemaDrift(
  resolved: ResolvedDb,
  rootDir: string,
  sourceDirs: string[],
  logger: { error: (msg: string) => void }
): Promise<SchemaDriftResult> {
  const covered = await coveredSchema(resolved)
  const actual = await introspectSchema(resolved)

  const { missingTables, missingColumns } = diffSchemas(covered, actual)

  // Compare on the full name. A migration that names no schema lands in
  // whichever one is default, so a BARE covered name still matches a qualified
  // table — but a QUALIFIED one must match exactly. Relaxing that second case
  // hides the failure this is here to catch: a second copy of a table in the
  // wrong schema (`public.orders` shadowing `app.orders`) would otherwise look
  // like the table the migrations created.
  const coveredFull = new Set(covered.keys())
  const coveredBare = new Set(
    [...covered.keys()].filter((t) => !t.includes('.'))
  )
  const unrecorded = [...actual.keys()].filter(
    (t) => !coveredFull.has(t) && !coveredBare.has(t.split('.').pop()!)
  )

  const runtime = await desiredRuntimeSchema(
    resolved,
    rootDir,
    sourceDirs,
    logger
  )
  const runtimeTables = unrecorded.filter((t) =>
    runtime.tables.has(t.split('.').pop()!)
  )
  const extraTables = unrecorded.filter((t) => !runtimeTables.includes(t))

  return {
    missingTables,
    missingColumns,
    runtimeTables,
    extraTables,
    skippedRuntimeSchemas: runtime.skipped,
    inSync: missingTables.length === 0 && missingColumns.length === 0,
  }
}

export type BaselineResult =
  | { status: 'behind'; drift: SchemaDriftResult }
  | { status: 'recorded'; recorded: string[] }

/**
 * Record the pending migrations as applied, for a database that already has
 * what they describe.
 *
 * The situation this exists for: a runtime created its tables at boot, and the
 * migration writing them down was authored afterwards. Every existing
 * deployment already has those tables, so running that migration fails; not
 * running it leaves the history claiming the schema is something else.
 *
 * Guarded by the same question `db check` answers. If the database is behind
 * its migrations in any way then the premise is false — the tables are not all
 * there — and recording them would hide a real gap behind a history that says
 * everything is applied. So it refuses and hands back the drift.
 */
export async function baseline(
  resolved: ResolvedDb,
  rootDir: string,
  sourceDirs: string[],
  logger: { error: (msg: string) => void }
): Promise<BaselineResult> {
  const drift = await computeSchemaDrift(resolved, rootDir, sourceDirs, logger)
  if (!drift.inSync) return { status: 'behind', drift }

  if (resolved.dialect === 'sqlite') {
    mkdirSync(dirname(resolved.dbFile), { recursive: true })
    const db = await openSqlite(resolved, resolved.dbFile)
    try {
      const recorded = await baselineMigrations(
        new SqliteMigrationExecutor(db),
        resolved.migrationsDir
      )
      return { status: 'recorded', recorded }
    } finally {
      db.close()
    }
  }

  if (resolved.dialect === 'mysql') {
    return withMysqlClient(resolved, async (client) => {
      const recorded = await baselineMigrations(
        new MysqlMigrationExecutor(client),
        resolved.migrationsDir
      )
      return { status: 'recorded', recorded }
    })
  }

  return withPostgresClient(resolved, async (client) => {
    const recorded = await baselineMigrations(
      new PostgresMigrationExecutor(client),
      resolved.migrationsDir
    )
    return { status: 'recorded', recorded }
  })
}

export interface AuthDriftResult {
  hasAuth: boolean
  inSync: boolean
  missingTables: string[]
  missingColumns: { table: string; columns: string[] }[]
}

export async function computeAuthDrift(
  resolved: ResolvedDb,
  rootDir: string,
  sourceDirs: string[],
  logger: { error: (msg: string) => void }
): Promise<AuthDriftResult> {
  const desired = await desiredAuthSchema(resolved, rootDir, sourceDirs, logger)
  if (!desired) {
    return {
      hasAuth: false,
      inSync: true,
      missingTables: [],
      missingColumns: [],
    }
  }
  const actual = await introspectSchema(resolved)
  const { missingTables, missingColumns } = diffSchemas(desired.tables, actual)
  return {
    hasAuth: true,
    inSync: missingTables.length === 0 && missingColumns.length === 0,
    missingTables,
    missingColumns,
  }
}

function nextMigrationFile(migrationsDir: string, label: string): string {
  mkdirSync(migrationsDir, { recursive: true })
  let max = 0
  try {
    for (const file of readdirSync(migrationsDir)) {
      const m = /^(\d+)/.exec(file)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
  } catch {
    max = 0
  }
  const num = String(max + 1).padStart(4, '0')
  return join(migrationsDir, `${num}-${label}.sql`)
}

/**
 * Something other than the project's own migrations that declares tables.
 *
 * Better Auth or the pikku runtime. They differ only in where the
 * declaration comes from; once materialized they answer the same two questions,
 * which is what lets one generator serve all of them.
 */
export interface SchemaSource {
  /**
   * Labels the generated migration and every report line about it.
   *
   * Part of the contract: change it and the migration written under the old
   * name is orphaned, so `db generate` writes the tables a second time.
   */
  name: string
  desired: DesiredSchema
  /** Prose for the migration header, saying where the SQL came from. */
  origin: string
  /**
   * The schema this source's SQL is qualified into, when it is.
   *
   * Carried per source rather than read off the resolved database because only
   * the sources pikku compiles can honour it. Better Auth writes its own
   * migration SQL through its own migrator and the runtime ships SQL as text —
   * neither goes through the schema builder, so neither can be qualified from
   * here, and claiming otherwise on their behalf would emit a delta that names
   * a table in a schema their `CREATE TABLE` never put it in.
   */
  schema?: string
}

// ─── The project's own declared tables ───────────────────────────────────────

/** Every index the migrations define, by name. */
async function coveredIndexes(resolved: ResolvedDb): Promise<Set<string>> {
  const names = (rows: unknown[], key: string) =>
    new Set(
      (rows as Record<string, string>[]).map((row) => row[key]!.toLowerCase())
    )
  switch (resolved.dialect) {
    case 'sqlite': {
      const db = await openSqlite(resolved, ':memory:')
      try {
        await migrate(
          new SqliteMigrationExecutor(db),
          resolved.migrationsDir,
          REPLAY
        )
        return names(
          db
            .prepare(`select name from sqlite_master where type = 'index'`)
            .all(),
          'name'
        )
      } finally {
        db.close()
      }
    }
    case 'mysql':
      return withScratchMysqlDatabase(resolved, async (client) => {
        await migrate(
          new MysqlMigrationExecutor(client),
          resolved.migrationsDir,
          REPLAY
        )
        const { rows } = await client.query(
          `select distinct index_name as name from information_schema.statistics
           where table_schema = database()`
        )
        return names(rows, 'name')
      })
    case 'postgres':
      return withScratchPostgresDatabase(resolved, async (client) => {
        await migrate(
          new PostgresMigrationExecutor(client),
          resolved.migrationsDir,
          REPLAY
        )
        const { rows } = await client.query(
          `select indexname as name from pg_indexes
           where schemaname not in ('pg_catalog', 'information_schema')`
        )
        return names(rows, 'name')
      })
  }
}

async function coveredUpdateRules(resolved: ResolvedDb): Promise<UpdateRules> {
  const lower = (value: unknown) => String(value).toLowerCase()
  switch (resolved.dialect) {
    case 'sqlite': {
      const db = await openSqlite(resolved, ':memory:')
      try {
        await migrate(
          new SqliteMigrationExecutor(db),
          resolved.migrationsDir,
          REPLAY
        )
        const rows = db
          .prepare(
            `select name, tbl_name as tbl, sql from sqlite_master where type = 'trigger'`
          )
          .all() as { name: string; tbl: string; sql: string }[]
        return {
          triggers: rows.map((row) => ({
            name: lower(row.name),
            table: lower(row.tbl),
            definition: row.sql,
          })),
          attributes: new Set(),
        }
      } finally {
        db.close()
      }
    }
    case 'mysql':
      return withScratchMysqlDatabase(resolved, async (client) => {
        await migrate(
          new MysqlMigrationExecutor(client),
          resolved.migrationsDir,
          REPLAY
        )
        const { rows } = await client.query(
          `select table_name as t, column_name as c from information_schema.columns
           where table_schema = database() and lower(extra) like '%on update%'`
        )
        return {
          triggers: [],
          attributes: new Set(
            (rows as { t: string; c: string }[]).map(
              (row) => `${lower(row.t)}.${lower(row.c)}`
            )
          ),
        }
      })
    case 'postgres':
      return withScratchPostgresDatabase(resolved, async (client) => {
        await migrate(
          new PostgresMigrationExecutor(client),
          resolved.migrationsDir,
          REPLAY
        )
        const { rows } = await client.query(
          `select t.tgname as name, c.relname as tbl, pg_get_triggerdef(t.oid) as def
           from pg_trigger t join pg_class c on c.oid = t.tgrelid
           where not t.tgisinternal`
        )
        return {
          triggers: (rows as { name: string; tbl: string; def: string }[]).map(
            (row) => ({
              name: lower(row.name),
              table: lower(row.tbl),
              definition: row.def,
            })
          ),
          attributes: new Set(),
        }
      })
  }
}

/** The columns of `table` in `schema`, matched the way `diffSchemas` matches. */
const coveredTable = (
  covered: SchemaMap,
  table: string,
  schema?: string
): Map<string, ColumnInfo> | undefined =>
  schema
    ? covered.get(qualifiedTableKey(schema, table))
    : (covered.get(table) ?? schemaQualifiedMatch(covered, table))

/**
 * Read a table's `renamedFrom` against what the migrations hold, and move the
 * table in `covered` to its new name the way the migration will, so what is
 * compared with it afterwards sees one table that moved rather than a table that
 * is gone and a new one. Run before the columns' renames, which name the table
 * as it will be.
 *
 * Returns the renames still to be written. A table renamed already (the new name
 * is there, the old one is not) is said, because the declaration still carries
 * it. A name that matches nothing, with no table of the new name either, is
 * refused: a table is never created by a rename that found nothing to rename.
 */
function applyTableRenames(
  renames: TableRename[],
  covered: SchemaMap,
  columnIndexes: Map<string, string[]>,
  schemaName: string | undefined
): { pending: TableRename[]; notes: string[]; refusals: string[] } {
  const out = {
    pending: [] as TableRename[],
    notes: [] as string[],
    refusals: [] as string[],
  }
  const keyOf = (table: string): string | undefined => {
    const direct = schemaName ? qualifiedTableKey(schemaName, table) : table
    if (covered.has(direct)) return direct
    if (schemaName) return undefined
    const matches = [...covered.keys()].filter((key) => {
      const parts = key.split('.')
      return parts.length === 2 && parts[1] === table
    })
    return matches.length === 1 ? matches[0] : undefined
  }
  for (const { from, to } of renames) {
    const oldKey = keyOf(from)
    const newKey = keyOf(to)
    if (oldKey && newKey) {
      out.refusals.push(
        `${to} is declared renamedFrom '${from}', but the migrations have both tables. ` +
          `generate cannot tell which one to keep: a person moves the rows and drops one.`
      )
    } else if (oldKey) {
      covered.set(
        `${oldKey.slice(0, oldKey.length - from.length)}${to}`,
        covered.get(oldKey)!
      )
      covered.delete(oldKey)
      for (const [key, names] of [...columnIndexes]) {
        if (key.startsWith(`${from}.`)) {
          columnIndexes.delete(key)
          columnIndexes.set(`${to}.${key.slice(from.length + 1)}`, names)
        }
      }
      out.pending.push({ from, to })
    } else if (newKey) {
      out.notes.push(
        `${to} is already renamed from '${from}' by an applied migration: delete renamedFrom from ${TABLES_FILE}.`
      )
    } else {
      out.refusals.push(
        `${to} is declared renamedFrom '${from}', but the migrations have no table of that name, and none called ${to}.`
      )
    }
  }
  return out
}

/**
 * Read `renamedFrom` against what the migrations hold, and rename the columns in
 * `covered` the way the migration will, so everything compared with it afterwards
 * sees a column that moved rather than one that is gone and one that is new.
 *
 * Returns the renames still to be written. One already applied (the new name is
 * there, the old one is not) is said, because the declaration still carries it.
 */
function applyRenames(
  renames: ColumnRename[],
  covered: SchemaMap,
  columnIndexes: Map<string, string[]>,
  schemaName: string | undefined
): { pending: ColumnRename[]; notes: string[]; refusals: string[] } {
  const out = {
    pending: [] as ColumnRename[],
    notes: [] as string[],
    refusals: [] as string[],
  }
  for (const rename of renames) {
    const { table, from, to } = rename
    const actual = coveredTable(covered, table, schemaName)
    if (!actual) continue
    const old = actual.get(from)
    if (old && actual.has(to)) {
      out.refusals.push(
        `${table}.${to} is declared renamedFrom '${from}', but the migrations have both columns. ` +
          `generate cannot tell which one to keep: a person moves the data and drops one.`
      )
    } else if (old) {
      actual.delete(from)
      actual.set(to, { ...old, name: to })
      const indexes = columnIndexes.get(`${table}.${from}`)
      if (indexes) {
        columnIndexes.delete(`${table}.${from}`)
        columnIndexes.set(`${table}.${to}`, indexes)
      }
      out.pending.push(rename)
    } else if (actual.has(to)) {
      out.notes.push(
        `${table}.${to} is already renamed from '${from}' by an applied migration: delete renamedFrom from ${TABLES_FILE}.`
      )
    } else {
      out.notes.push(
        `${table}.${to} is declared renamedFrom '${from}', but no column of that name exists, so it is a new column.`
      )
    }
  }
  return out
}

/**
 * Apply a declaration to an empty database and read back what it creates.
 *
 * A declaration may point a foreign key at a table outside itself: one a
 * hand-written migration made, a `declareOnly` table, or Better Auth's `user`.
 * Those have to exist for the engine to accept the DDL, so each one the
 * declaration references is created here first, with the type the migrations
 * gave it, and left out of the result.
 *
 * A stand-in instead of the real tables, because the real ones can't be here:
 * the migrations may already create the very tables being declared.
 */
async function materializeDeclaration(
  resolved: ResolvedDb,
  { schema, owners }: LoadedDeclaration,
  covered: SchemaMap,
  schemaName: string | undefined
): Promise<{ desired?: DesiredSchema; refusals: string[]; notes: string[] }> {
  const refusals: string[] = []
  const notes: string[] = []
  const standIns = new Map<string, ColumnInfo[]>()

  for (const { table, column } of tableRequirements(schema.tables)) {
    const info = coveredTable(covered, table, schemaName)?.get(column)
    if (!info) {
      refusals.push(
        `${owners?.[table] ?? TABLES_FILE} references ${table}.${column}, which neither it nor any migration creates.`
      )
      continue
    }
    standIns.set(table, [...(standIns.get(table) ?? []), info])
  }
  if (refusals.length > 0) return { refusals, notes }

  return withThrowawayKysely(resolved, async (db, introspect) => {
    const physical = db.withoutPlugins()
    for (const [table, columns] of standIns) {
      await columns
        .reduce(
          (builder, { name, type }, index) =>
            builder.addColumn(name, sql.raw(type), (col) =>
              index === 0 ? col.primaryKey() : col.unique()
            ),
          physical.schema.createTable(table)
        )
        .execute()
    }
    const before = await introspect()

    let types: RequiredTypes
    try {
      await applyPikkuSchemas(db, [schema])
      types = (await resolveRequirements(db, [schema])).types
    } catch (error: any) {
      return {
        refusals: [
          `${TABLES_FILE} does not apply on ${resolved.dialect}: ${error.message}.`,
        ],
        notes,
      }
    }

    const tables = await introspect()
    for (const table of before.keys()) tables.delete(table)
    const desiredSql = compilePikkuSchemas(db, [schema], types, schemaName)
    // Last, because the probes add tables to the throwaway database.
    if (resolved.dialect === 'mysql') {
      if (hasDeclaredSql(schema.tables)) {
        notes.push(
          'The declared default and onUpdate SQL was not executed: MySQL has no embedded engine to run it on. Only the engine keys and the generated statements were checked.'
        )
      }
    } else {
      refusals.push(
        ...(await runDeclaredSql(db, schema.tables)).map(
          (problem) => `${TABLES_FILE}: ${problem}`
        )
      )
    }
    return {
      desired: { tables, sql: desiredSql },
      refusals,
      notes,
    }
  })
}

/** The names of every foreign key constraint the migrations create, on the engines that name them. */
async function coveredForeignKeyNames(
  resolved: ResolvedDb
): Promise<Set<string>> {
  const lower = (rows: { name: string }[]) =>
    new Set(rows.map((row) => row.name.toLowerCase()))
  switch (resolved.dialect) {
    case 'sqlite':
      return new Set()
    case 'postgres':
      return withScratchPostgresDatabase(resolved, async (client) => {
        await migrate(
          new PostgresMigrationExecutor(client),
          resolved.migrationsDir,
          REPLAY
        )
        const { rows } = await client.query(
          `select conname as name from pg_constraint where contype = 'f'`
        )
        return lower(rows as { name: string }[])
      })
    case 'mysql':
      return withScratchMysqlDatabase(resolved, async (client) => {
        await migrate(
          new MysqlMigrationExecutor(client),
          resolved.migrationsDir,
          REPLAY
        )
        const { rows } = await client.query(
          `select constraint_name as name from information_schema.table_constraints
           where table_schema = database() and constraint_type = 'FOREIGN KEY'`
        )
        return lower(rows as { name: string }[])
      })
  }
}

/** The statements for every table rename still to be written, with what they keep. */
async function tableRenameStatementsFor(
  resolved: ResolvedDb,
  renames: TableRename[],
  declaration: LoadedDeclaration,
  desiredSql: string,
  quote: (name: string) => string,
  qualify: (table: string) => string,
  schemaName: string | undefined
): Promise<{ statements: string[]; kept: Set<string> }> {
  const out = { statements: [] as string[], kept: new Set<string>() }
  if (renames.length === 0) return out
  const existing = {
    indexes: await coveredIndexes(resolved),
    triggers: new Set(
      (await coveredUpdateRules(resolved)).triggers.map((t) => t.name)
    ),
    foreignKeys: await coveredForeignKeyNames(resolved),
  }
  const declared = Object.fromEntries(
    Object.entries(declaration.schema.tables).map(([name, table]) => [
      snakeCase(name),
      table,
    ])
  )
  for (const rename of renames) {
    const result = tableRenameStatements({
      dialect: resolved.dialect,
      rename,
      declaration: declared[rename.to]!,
      desiredSql,
      existing,
      quote,
      qualify,
      qualifyObject: (name) =>
        schemaName ? `${quote(schemaName)}.${quote(name)}` : quote(name),
    })
    out.statements.push(...result.statements)
    for (const name of result.kept) out.kept.add(name)
  }
  return out
}

/** What `db generate` would write for a declaration, or why it won't. */
export interface DeclaredTablesPlan {
  /** Tables the declaration names. */
  tables: string[]
  /**
   * The migration bodies, one file each, in the order they apply: additions,
   * then drops. Empty when the migrations already cover the declaration, and
   * when a destructive change has not been approved.
   */
  bodies: string[]
  /** Why nothing can be written. When present, `body` is empty. */
  refusals: string[]
  /** Changes that lose data or break running code, which a person approves. */
  destructive: DestructiveChange[]
  /** What the migration changes about constraints that exist, and why: a stale check dropped, a changed bound. */
  notes?: string[]
}

/**
 * Bring the declaration and the migrations into line.
 *
 * The same delta `generateMigrations` writes for every other source, with one
 * difference that matters: this one is the project's data, and a column or
 * table that left the declaration may be a slip of the keyboard. Additions are
 * written. A drop is written only when `allowDestructive` says a person
 * approved it, and each statement carries the destructive marker so `migrate`
 * asks again. Changing a type or a constraint on an existing column is refused
 * with the reason, and nothing is written.
 *
 * Whatever passes is rehearsed before it is handed back: applied on top of the
 * real migrations in a throwaway database and diffed again. That is the check
 * that catches what no comparison can see, such as sqlite refusing a
 * `CURRENT_TIMESTAMP` default on `ADD COLUMN`.
 */
export async function planDeclaredTables(
  resolved: ResolvedDb,
  declaration: LoadedDeclaration | null,
  otherSources: SchemaSource[] = [],
  options: {
    serverVersion?: () => Promise<string>
    allowDestructive?: boolean
  } = {}
): Promise<DeclaredTablesPlan | null> {
  const recorded = recordedDeclaredTables(resolved.migrationsDir)
  // No `db/tables.ts` and no wired addon owning tables is an empty declaration:
  // whatever the migrations recorded is dropped by an approved change, as when
  // a table leaves a declaration that exists. Only nothing recorded means
  // there is nothing to plan.
  if (!declaration) {
    if (recorded.size === 0) return null
    declaration = emptyDeclaration()
  }

  // Before the declaration is materialized: a server that cannot take a CHECK
  // (MariaDB) would only answer it with a raw syntax error.
  if (resolved.dialect === 'mysql') {
    const mysql = resolved
    const refusal = mysqlCheckRefusal(
      mysqlCheckSupport(
        await (options.serverVersion ?? (() => mysqlServerVersion(mysql)))()
      ),
      declaredConstraints(declaration.schema.tables).map(
        (c) => `${c.where}: ${c.constraint}`
      ),
      TABLES_FILE
    )
    if (refusal)
      return { tables: [], bodies: [], refusals: [refusal], destructive: [] }
  }

  const schemaName =
    resolved.dialect === 'postgres' ? resolved.schema : undefined
  const columnIndexes = new Map<string, string[]>()
  const covered = await coveredSchema(resolved, columnIndexes)
  const tablesRenamed = applyTableRenames(
    declaration.renamedTables,
    covered,
    columnIndexes,
    schemaName
  )
  const renamed = applyRenames(
    declaration.renames,
    covered,
    columnIndexes,
    schemaName
  )
  const notes: string[] = [...tablesRenamed.notes, ...renamed.notes]
  const materialized = await materializeDeclaration(
    resolved,
    declaration,
    covered,
    schemaName
  )
  const { desired, refusals } = materialized
  notes.push(...materialized.notes)
  refusals.push(...tablesRenamed.refusals, ...renamed.refusals)
  if (!desired) return { tables: [], bodies: [], refusals, destructive: [] }

  const tables = [...desired.tables.keys()]
  const shapes = splitStatements(desired.sql).map((statement) => ({
    statement,
    shape: statementShape(statement),
  }))
  for (const { statement, shape } of shapes) {
    if (shape.kind === 'other') {
      refusals.push(
        `${TABLES_FILE} may only create tables and indexes, because nothing else can be compared ` +
          `with what the migrations hold. Found: ${statement.split('\n')[0]}`
      )
    }
  }
  refusals.push(
    ...declareOnlyProblems(
      declaration.declareOnly,
      (table) => coveredTable(covered, table, schemaName),
      resolved.dialect
    )
  )
  if (declaresOnUpdate(declaration.declareOnly)) {
    refusals.push(
      ...declareOnlyOnUpdateProblems(
        declaration.declareOnly,
        await coveredUpdateRules(resolved),
        resolved.dialect
      )
    )
  }

  const ownerOf = (table: string) => declaration.owners?.[table] ?? TABLES_FILE
  for (const source of otherSources) {
    for (const table of tables.filter((t) => source.desired.tables.has(t))) {
      refusals.push(
        `${ownerOf(table)} declares ${table}, which belongs to ${source.origin}. Pick another name.`
      )
    }
  }

  const compare = (against: SchemaMap) => {
    const compared = tables.flatMap((table) => {
      const actual = coveredTable(against, table, schemaName)
      return actual
        ? [
            refuseTableChanges(
              table,
              desired.tables.get(table)!,
              actual,
              resolved.migrationsDir,
              resolved.rootDir,
              ownerOf(table)
            ),
          ]
        : []
    })
    return {
      refusals: compared.flatMap((c) => c.refusals),
      destructive: compared.flatMap((c) => c.destructive),
    }
  }
  const comparable = (against: SchemaMap): string[] => {
    const { refusals, destructive } = compare(against)
    return [...refusals, ...destructive.map((d) => d.what)]
  }

  const compared = compare(covered)
  refusals.push(...compared.refusals)
  const destructive: DestructiveChange[] = compared.destructive
  const declaredOnly = new Set(declaredTableNames(declaration).declareOnly)
  for (const table of recorded) {
    if (
      !desired.tables.has(table) &&
      !declaredOnly.has(table) &&
      coveredTable(covered, table, schemaName)
    ) {
      destructive.push({
        kind: 'dropTable',
        table,
        what: `DROP TABLE ${table}: its rows are lost`,
      })
    }
  }
  if (refusals.length > 0) return { tables, bodies: [], refusals, destructive }

  const { missingTables, missingColumns } = diffSchemas(
    desired.tables,
    covered,
    schemaName
  )
  const statements = tablesInSourceOrder(desired.sql, missingTables).map(
    (table) => tableCreationSql(desired.sql, table).join('\n\n')
  )

  const quote =
    resolved.dialect === 'mysql' ? quoteMysqlIdentifier : quoteIdentifier
  const qualify = (table: string) =>
    schemaName ? `${quote(schemaName)}.${quote(table)}` : quote(table)

  const tableRenameSql = await tableRenameStatementsFor(
    resolved,
    tablesRenamed.pending,
    declaration,
    desired.sql,
    quote,
    qualify,
    schemaName
  )

  for (const { table, columns } of missingColumns) {
    const { columns: definitions, constraints } = tableDefinitions(
      desired.sql,
      table
    )
    for (const column of columns) {
      statements.push(
        `ALTER TABLE ${qualify(table)} ADD COLUMN ${definitions.get(column)};`
      )
      for (const constraint of constraints.filter((c) =>
        c.includes(quote(column))
      )) {
        if (resolved.dialect === 'sqlite') {
          refusals.push(
            `${table}.${column} is new and part of a table-level constraint, which sqlite cannot add ` +
              `to a table that exists: ${constraint}. Declare the constraint on the column, or ` +
              `a person writes that migration in ${relative(resolved.rootDir, resolved.migrationsDir)}.`
          )
        } else {
          statements.push(`ALTER TABLE ${qualify(table)} ADD ${constraint};`)
        }
      }
    }
  }

  // Dropped last: what the additions above need is still there when they run.
  const droppedIndexes = new Set<string>()
  const drops = destructive.flatMap((change) => {
    const qualified = qualify(change.table)
    return change.kind === 'dropTable'
      ? [
          `${DESTRUCTIVE_MIGRATION_MARKER}${change.what}\nDROP TABLE ${qualified};`,
        ]
      : [
          dropColumnStatements(
            resolved.dialect,
            qualified,
            change.table,
            change.column!,
            change.what,
            columnIndexes,
            quote,
            droppedIndexes
          ).join('\n'),
        ]
  })

  // What has to leave a renamed column before it moves: MySQL refuses to rename
  // a column a CHECK still names. The new checks go in the file after the rename.
  const beforeRename = new Map<string, string[]>()
  // SQLite gets no generated CHECKs, so there is nothing to compare there.
  for (const table of resolved.dialect === 'sqlite' ? [] : tables) {
    const actual = coveredTable(covered, table, schemaName)
    if (!actual) continue
    const { columns: definitions } = tableDefinitions(desired.sql, table)
    for (const [column, info] of desired.tables.get(table)!) {
      const existing = actual.get(column)
      if (!existing) continue
      const plan = planConstraints(table, column, info, existing)
      if (plan.drop.length + plan.add.length === 0) continue
      notes.push(...plan.reasons.map((r) => `${table}.${column}: ${r}`))

      const added = plan.add.map((check) => ({
        column,
        name: check.name,
        expression: inlineCheckExpression(
          definitions.get(column) ?? '',
          check.name
        ),
      }))
      const lost = added.find((check) => !check.expression)
      if (lost) {
        refusals.push(
          `${table}.${column}: ${lost.name} is not written inline on the column, so generate cannot lift its text.`
        )
        continue
      }

      const dialect = resolved.dialect === 'mysql' ? 'mysql' : 'postgres'
      const where = { schema: schemaName, table, qualified: qualify(table) }
      const add = added.map((a) => ({ ...a, expression: a.expression! }))
      const rename = renamed.pending.find(
        (r) => r.table === table && r.to === column
      )
      if (rename) {
        // The old bound goes in this file and the new one in the next, so rows
        // that break the new one would leave the column unbound. Ask them now,
        // under the old name, and a bound they break is refused before the old
        // one is gone.
        const probes = add.map((a) =>
          checkProbeLine({
            ...(schemaName ? { schema: schemaName } : {}),
            table,
            sql: checkProbeSql(
              where.qualified,
              a.expression.split(quote(column)).join(quote(rename.from))
            ),
          })
        )
        beforeRename.set(`${table}.${column}`, [
          ...probes,
          ...checkChangeStatements(
            dialect,
            where,
            { drop: plan.drop, add: [] },
            quote
          ),
        ])
        statements.push(
          ...checkChangeStatements(dialect, where, { drop: [], add }, quote)
        )
      } else {
        statements.push(
          ...checkChangeStatements(
            dialect,
            where,
            { drop: plan.drop, add },
            quote
          )
        )
      }
    }
  }
  // An index on a new table came with its `CREATE TABLE` above.
  const newIndexes = shapes.filter(
    ({ shape }) =>
      shape.kind === 'index' && !missingTables.includes(shape.table)
  )
  if (newIndexes.length > 0) {
    const existing = await coveredIndexes(resolved)
    for (const { statement, shape } of newIndexes) {
      if (
        shape.kind === 'index' &&
        !existing.has(shape.name) &&
        !tableRenameSql.kept.has(shape.name)
      ) {
        statements.push(statement)
      }
    }
  }
  // The same for a trigger, which a table created above already carries.
  const newTriggers = shapes.filter(
    ({ shape }) =>
      shape.kind === 'trigger' && !missingTables.includes(shape.table)
  )
  if (newTriggers.length > 0) {
    const { triggers } = await coveredUpdateRules(resolved)
    const existing = new Set(triggers.map((trigger) => trigger.name))
    for (const { statement, shape } of newTriggers) {
      if (
        shape.kind === 'trigger' &&
        !existing.has(shape.name) &&
        !tableRenameSql.kept.has(shape.name)
      ) {
        statements.push(statement)
      }
    }
  }
  // Every trigger calls the one shared function, so it goes in first.
  const sharedFunction = shapes.find(({ shape }) => shape.kind === 'function')
  if (
    sharedFunction &&
    statements.some((statement) => /^create\s+trigger\b/im.test(statement))
  ) {
    statements.unshift(sharedFunction.statement)
  }
  if (refusals.length > 0) return { tables, bodies: [], refusals, destructive }

  // One file per kind of change, in the order they can apply: a rename first
  // (nothing else names the old table or column by then), additions, drops last.
  const renames = [
    ...tableRenameSql.statements,
    ...renamed.pending.flatMap(({ table, from, to }) => [
      ...(beforeRename.get(`${table}.${to}`) ?? []),
      `ALTER TABLE ${qualify(table)} RENAME COLUMN ${quote(from)} TO ${quote(to)};`,
    ]),
  ]
  const bodies = [renames, statements, drops]
    .filter((group) => group.length > 0)
    .map((group) => group.join('\n\n'))
  if (bodies.length === 0) {
    return { tables, bodies, refusals, destructive, notes }
  }

  const dropped = destructive.filter((d) => d.kind === 'dropTable')
  const rehearsal = await rehearseMigration(
    resolved,
    bodies,
    (after) => {
      const left = diffSchemas(desired.tables, after, schemaName)
      return [
        ...comparable(after),
        ...dropped
          .filter((d) => coveredTable(after, d.table, schemaName))
          .map((d) => `${d.table} is still there`),
        ...left.missingTables.map((t) => `${t} is still missing`),
        ...left.missingColumns.map(
          (c) => `${c.table} still lacks ${c.columns}`
        ),
      ]
    },
    dropped.length > 0
  )
  if (rehearsal.length > 0) {
    return { tables, bodies: [], refusals: rehearsal, destructive, notes }
  }
  // Rehearsed first, so what is asked for approval is what would be written.
  if (destructive.length > 0 && !options.allowDestructive) {
    return { tables, bodies: [], refusals, destructive, notes }
  }
  return { tables, bodies, refusals, destructive, notes }
}

/** The `version()` the configured MySQL-protocol server reports. */
async function mysqlServerVersion(resolved: ResolvedMysqlDb): Promise<string> {
  return withMysqlClient(resolved, async (client) => {
    const { rows } = await client.query('select version() as v')
    return String((rows[0] as { v?: unknown } | undefined)?.v ?? '')
  })
}

/**
 * Apply a migration that has not been written to a copy of the real ones.
 *
 * Copied rather than written in place and removed, so a crash halfway leaves the
 * project's migrations as they were.
 */
async function rehearseMigration(
  resolved: ResolvedDb,
  bodies: string[],
  check: (after: SchemaMap) => string[],
  refuseDanglingKeys = false
): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-rehearsal-'))
  try {
    if (existsSync(resolved.migrationsDir)) {
      cpSync(resolved.migrationsDir, dir, { recursive: true })
    }
    for (const body of bodies) {
      writeFileSync(
        nextMigrationFile(dir, APP_TABLES_SOURCE),
        `${body}\n`,
        'utf8'
      )
    }
    let after: SchemaMap
    try {
      after = await coveredSchema(
        { ...resolved, migrationsDir: dir } as ResolvedDb,
        undefined,
        refuseDanglingKeys
      )
    } catch (error: any) {
      return [
        `The migration for ${TABLES_FILE} does not apply on top of the existing ones: ${error.message}. ` +
          `Change the declaration so it can be added to what exists, or a person writes that step in ` +
          `${relative(resolved.rootDir, resolved.migrationsDir)}.`,
      ]
    }
    return check(after).map(
      (problem) =>
        `The migration for ${TABLES_FILE} does not bring the schema into line: ${problem}.`
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Whether the migrations cover `db/tables.ts`, for commands that do not write them. */
export interface DeclaredTablesDrift {
  pending: boolean
  refusals: string[]
  /** Changes that wait for approval: `db generate --allowDestructive`. */
  destructive: string[]
  /** Why a pending migration changes constraints that exist (a stale check, a changed bound). */
  notes: string[]
}

export async function declaredSqliteConstraintNotice(
  resolved: ResolvedDb,
  addons: AddonDeclaration[] = []
): Promise<string | undefined> {
  if (resolved.dialect !== 'sqlite') return undefined
  const declaration = await loadMergedDeclaration(resolved.rootDir, addons)
  if (!declaration) return undefined
  // What the migrations already enforce comes from replaying them, as the
  // declaration is compared with elsewhere.
  const covered = await coveredSchema(resolved)
  return sqliteConstraintNotice(
    declaration.schema.tables,
    (table, column) => covered.get(table)?.get(column)?.checks
  )
}

export async function computeDeclaredTablesDrift(
  resolved: ResolvedDb,
  addons: AddonDeclaration[] = []
): Promise<DeclaredTablesDrift> {
  const plan = await planDeclaredTables(
    resolved,
    await loadMergedDeclaration(resolved.rootDir, addons)
  )
  return {
    pending: Boolean(plan?.bodies.length || plan?.destructive.length),
    refusals: plan?.refusals ?? [],
    destructive: plan?.destructive.map((d) => d.what) ?? [],
    notes: plan?.bodies.length ? (plan.notes ?? []) : [],
  }
}

/**
 * Every schema source the project has, in the order they must be applied.
 *
 * Auth comes first because the runtime's scope tables reference its `user`
 * table. Addon tables are not a source: they are declared, and join the app's
 * own declaration.
 */
export async function schemaSources(
  resolved: ResolvedDb,
  rootDir: string,
  sourceDirs: string[],
  logger: { error: (msg: string) => void },
  services?: ReadonlySet<string>
): Promise<SchemaSource[]> {
  const sources: SchemaSource[] = []

  const auth = await desiredAuthSchema(resolved, rootDir, sourceDirs, logger)
  if (auth) {
    sources.push({
      name: 'better-auth',
      desired: auth,
      origin: 'pikkuBetterAuth (Better Auth)',
    })
  }

  const runtime = await desiredRuntimeSchema(
    resolved,
    rootDir,
    sourceDirs,
    logger,
    services
  )
  if (runtime.tables.size > 0) {
    sources.push({
      name: 'pikku-runtime',
      desired: runtime,
      origin: "@pikku/kysely's runtime services",
      schema: resolved.dialect === 'postgres' ? resolved.schema : undefined,
    })
  }

  return sources
}

/**
 * Render the columns a table is missing as `ALTER TABLE … ADD COLUMN`.
 *
 * A column that is `NOT NULL` with no default cannot be added to a table that
 * already has rows — the value for those rows is a decision only the author can
 * make. Rather than guessing one or quietly dropping the constraint, the
 * statement is emitted with the problem written above it, so it surfaces during
 * the review the command already asks for.
 */
function addColumnStatements(
  table: string,
  columns: ColumnInfo[],
  quote: (name: string) => string
): { sql: string[]; needsBackfill: string[] } {
  const sql: string[] = []
  const needsBackfill: string[] = []

  for (const column of columns) {
    const parts = [
      `ALTER TABLE ${table} ADD COLUMN ${quote(column.name)} ${column.type}`,
    ]
    if (column.defaultValue !== null) {
      parts.push(`DEFAULT ${column.defaultValue}`)
    }
    if (column.notNull) parts.push('NOT NULL')

    if (column.notNull && column.defaultValue === null) {
      needsBackfill.push(`${table}.${column.name}`)
      sql.push(
        `-- REVIEW: ${column.name} is NOT NULL with no default. This fails if ${table} has rows.\n` +
          `-- Add a default, or split this into: add nullable, backfill, then set NOT NULL.\n` +
          `${parts.join(' ')};`
      )
    } else {
      sql.push(`${parts.join(' ')};`)
    }
  }

  return { sql, needsBackfill }
}

/**
 * Drop one column, marked destructive with `reason`. SQLite refuses to drop a
 * column an index still names, so its indexes go first; the other engines
 * drop (or shrink) their own, and a primary key, unique, foreign key or check
 * that cannot go with the column fails the statement, which no flag overrides.
 */
function dropColumnStatements(
  dialect: ResolvedDb['dialect'],
  qualified: string,
  table: string,
  column: string,
  reason: string,
  columnIndexes: Map<string, string[]>,
  quote: (name: string) => string,
  droppedIndexes: Set<string> = new Set()
): string[] {
  // An index over two dropped columns goes once: the second DROP INDEX would fail.
  const indexes = (
    dialect === 'sqlite' ? (columnIndexes.get(`${table}.${column}`) ?? []) : []
  ).filter((index) => !droppedIndexes.has(index))
  for (const index of indexes) droppedIndexes.add(index)
  return [
    `${DESTRUCTIVE_MIGRATION_MARKER}${reason}`,
    ...indexes.map((index) => `DROP INDEX ${quote(index)};`),
    `ALTER TABLE ${qualified} DROP COLUMN ${quote(column)};`,
  ]
}

/**
 * The statements that stop an orphaned required column failing every insert.
 *
 * PostgreSQL and MySQL relax it — the column and what it holds stay, only the
 * constraint goes. SQLite cannot change a column's constraints, so it is
 * dropped, indexes first (SQLite refuses to drop a column an index still names),
 * and the statement is marked destructive: what the column held is lost.
 */
function orphanedColumnStatements(
  dialect: ResolvedDb['dialect'],
  qualified: string,
  table: string,
  columns: ColumnInfo[],
  columnIndexes: Map<string, string[]>,
  quote: (name: string) => string
): string[] {
  const statements: string[] = []
  const droppedIndexes = new Set<string>()
  for (const column of columns) {
    const note =
      `-- ${table}.${column.name} is NOT NULL with no default, and its source no longer\n` +
      `-- declares it, so nothing inserts it and every insert into ${table} fails.\n`
    if (dialect === 'postgres') {
      statements.push(
        `${note}ALTER TABLE ${qualified} ALTER COLUMN ${quote(column.name)} DROP NOT NULL;`
      )
      continue
    }
    if (dialect === 'mysql') {
      statements.push(
        `${note}ALTER TABLE ${qualified} MODIFY COLUMN ${quote(column.name)} ${column.type} NULL;`
      )
      continue
    }
    statements.push(
      note +
        dropColumnStatements(
          dialect,
          qualified,
          table,
          column.name,
          `DROP COLUMN ${table}.${column.name}: its data is lost`,
          columnIndexes,
          quote,
          droppedIndexes
        ).join('\n')
    )
  }
  return statements
}

export interface GeneratedMigration {
  source: string
  file: string
  /** Columns the migration adds that need a backfill decision before it is applied. */
  needsBackfill: string[]
  /**
   * Columns the migration drops or relaxes because the source no longer writes
   * them and they were NOT NULL with no default, so every insert failed.
   */
  orphaned: string[]
}

export interface GenerateResult {
  /** Sources whose tables the migrations already cover. */
  upToDate: string[]
  written: GeneratedMigration[]
  /**
   * Why `db/tables.ts` could not be written down. Reported instead of thrown,
   * because the other sources' migrations have been written by then and a
   * caller still has to say so.
   */
  refusals: string[]
  /** What `db/tables.ts` asks that needs no decision but is worth saying, such as a `renamedFrom` already applied. */
  notes: string[]
  /**
   * Drops of db/tables.ts that nothing was written for, because they were not
   * approved. Acting on them is a decision for a person, so the command lists
   * them and stops.
   */
  destructive: DestructiveChange[]
}

/**
 * Write a migration for each source the migrations do not yet cover. The
 * sources are Better Auth's and the runtime's; the tables a project and its
 * addons declare are planned separately, against what these write.
 */
export async function writeSourceMigrations(
  resolved: ResolvedDb,
  sources: SchemaSource[]
): Promise<{ upToDate: string[]; written: GeneratedMigration[] }> {
  const result = {
    upToDate: [] as string[],
    written: [] as GeneratedMigration[],
  }

  for (const source of sources) {
    // Re-read after each write: a migration just written for an earlier source
    // is part of what the next one is compared against.
    const columnIndexes = new Map<string, string[]>()
    const covered = await coveredSchema(resolved, columnIndexes)

    const { missingTables, missingColumns } = diffSchemas(
      source.desired.tables,
      covered,
      source.schema
    )
    const orphans = orphanedRequiredColumns(
      source.desired.tables,
      covered,
      source.schema
    )
    if (
      missingTables.length === 0 &&
      missingColumns.length === 0 &&
      orphans.length === 0
    ) {
      result.upToDate.push(source.name)
      continue
    }

    // Matched the same way `diffSchemas` matches, qualifier and all. A project
    // that keeps its tables in a schema has them covered as `app.workflow_step`
    // while the declaration names them bare, so a strict `covered.has(t)` reads
    // "nothing is covered" and re-emits the whole schema over tables that are
    // already there — and a copy in some other schema is not that table, so it
    // must not count either.
    const partial = [...source.desired.tables.keys()].some((t) =>
      source.schema
        ? covered.has(qualifiedTableKey(source.schema, t))
        : covered.has(t) || schemaQualifiedMatch(covered, t) !== undefined
    )

    let body: string
    let needsBackfill: string[] = []
    const orphaned: string[] = []

    // The source's own SQL is already qualified when it can be; the delta below
    // is written here from bare introspected names, so it has to be qualified
    // to match, or it alters a table in whichever schema `search_path` finds.
    // Quoted, because the compiled SQL this delta has to line up with goes
    // through the schema builder and is quoted there. `db.schema: "App"` left
    // raw folds to `app`, so the delta would alter a table in a schema the
    // runtime never uses.
    const quote =
      resolved.dialect === 'postgres' ? quoteIdentifier : (name: string) => name
    const qualify = (table: string) =>
      source.schema
        ? `${quoteIdentifier(source.schema)}.${quote(table)}`
        : quote(table)

    if (!partial) {
      body = source.desired.sql
    } else {
      const statements: string[] = []
      for (const table of tablesInSourceOrder(
        source.desired.sql,
        missingTables
      )) {
        // A wholly new table is the first-time case in miniature: nothing to
        // diff against, and the source's own SQL already says exactly how to
        // build it. Rendering the column map instead would drop the primary
        // key, the foreign keys and the indexes — a table that applies cleanly
        // and is permanently wrong.
        const own = tableCreationSql(source.desired.sql, table)
        if (own.length > 0) {
          statements.push(own.join('\n\n'))
          continue
        }

        const columns = source.desired.tables.get(table)
        statements.push(
          `-- REVIEW: ${table} is new, and its CREATE TABLE could not be found in the\n` +
            `-- source's own SQL. The column list below carries no indexes, constraints\n` +
            `-- or foreign keys — copy the real statement over it before applying.\n` +
            `CREATE TABLE ${qualify(table)} (\n` +
            [...(columns?.values() ?? [])]
              .map(
                (c) =>
                  `  ${quote(c.name)} ${c.type}${c.notNull ? ' NOT NULL' : ''}`
              )
              .join(',\n') +
            '\n);'
        )
      }
      for (const { table, columns } of missingColumns) {
        const infos = columns
          .map((name) => source.desired.tables.get(table)?.get(name))
          .filter((c): c is ColumnInfo => c !== undefined)
        const added = addColumnStatements(qualify(table), infos, quote)
        statements.push(...added.sql)
        needsBackfill.push(...added.needsBackfill)
      }
      for (const { table, columns } of orphans) {
        const dropped = orphanedColumnStatements(
          resolved.dialect,
          qualify(table),
          table,
          columns,
          columnIndexes,
          quote
        )
        statements.push(...dropped)
        orphaned.push(...columns.map((c) => `${table}.${c.name}`))
      }
      body = statements.join('\n\n')
    }

    const file = nextMigrationFile(resolved.migrationsDir, source.name)
    const header =
      `-- Generated by \`pikku db generate\` from ${source.origin}.\n` +
      '-- Re-run the command after changing that source.\n\n'
    writeFileSync(file, header + body + '\n', 'utf8')
    result.written.push({ source: source.name, file, needsBackfill, orphaned })
  }

  return result
}

/**
 * Write a migration for every schema source the migrations do not yet cover.
 *
 * Three cases per source, and the distinction matters. Fully covered is
 * nothing to do. Nothing covered writes the source's own SQL verbatim, which is
 * the one case where the source knows better than any diff — it carries the
 * indexes, constraints and ordering a table-and-column comparison cannot see.
 * Partially covered writes the delta, because re-emitting the whole schema
 * would fail on the tables that already exist.
 *
 * The delta is itself two different things, and only one of them is a diff. A
 * table the migrations already have but a column short is a genuine alteration,
 * so it becomes `ALTER TABLE … ADD COLUMN`. A table they do not have at all —
 * what enabling a Better Auth plugin produces — has
 * nothing to diff against, so it is lifted verbatim out of the source's own SQL
 * for the same reason the first-time case is: the column map it would otherwise
 * be rendered from knows nothing about keys, constraints or indexes.
 *
 * Migrations are written one file per source, numbered in dependency order, so
 * a project can review and apply them independently.
 */
export async function generateMigrations(
  resolved: ResolvedDb,
  rootDir: string,
  sourceDirs: string[],
  logger: { error: (msg: string) => void },
  addons: AddonDeclaration[] = [],
  services?: ReadonlySet<string>,
  options: { allowDestructive?: boolean } = {}
): Promise<GenerateResult> {
  // Read and checked first: a retired or unreadable declaration refuses the
  // whole command, so no source's migration may be written before it does.
  const declaration = await loadMergedDeclaration(resolved.rootDir, addons)
  const sources = await schemaSources(
    resolved,
    rootDir,
    sourceDirs,
    logger,
    services
  )
  const result: GenerateResult = {
    upToDate: [],
    written: [],
    refusals: [],
    destructive: [],
    notes: [],
  }

  const fromSources = await writeSourceMigrations(resolved, sources)
  result.upToDate.push(...fromSources.upToDate)
  result.written.push(...fromSources.written)

  // Last, and only now: a declared table may reference any of the above, and
  // what those sources just wrote is part of what it is compared against.
  const plan = await planDeclaredTables(resolved, declaration, sources, {
    allowDestructive: options.allowDestructive,
  })
  if (plan) {
    result.refusals.push(...plan.refusals)
    result.notes.push(...(plan.notes ?? []))
    if (plan.destructive.length > 0 && !options.allowDestructive) {
      result.destructive.push(...plan.destructive)
    }
    for (const body of plan.bodies) {
      const file = nextMigrationFile(resolved.migrationsDir, APP_TABLES_SOURCE)
      const header =
        `-- Generated by \`pikku db generate\` from ${TABLES_FILE}.\n` +
        '-- Change that file and re-run the command; do not edit this one.\n' +
        `${declaredTablesMarker(plan.tables)}\n\n`
      writeFileSync(file, header + body + '\n', 'utf8')
      result.written.push({
        source: APP_TABLES_SOURCE,
        file,
        needsBackfill: [],
        orphaned: [],
      })
    }
    if (
      plan.bodies.length === 0 &&
      plan.refusals.length === 0 &&
      plan.destructive.length === 0
    ) {
      result.upToDate.push(APP_TABLES_SOURCE)
    }
  }

  return result
}
