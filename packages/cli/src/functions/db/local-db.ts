import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import { resolve, isAbsolute, relative, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely'
import type { PGlite } from '@electric-sql/pglite'
import {
  migrate,
  baselineMigrations,
  type MigrateResult,
} from './db-migrator.js'
import type { ColumnInfo, DbIntrospector } from './db-introspector.js'
import {
  applyPikkuSchemas,
  compilePikkuSchemas,
  pikkuSchemas,
  resolveRequirements,
  type PikkuSchema,
  type RequiredTypes,
} from '@pikku/kysely'
import { loadAuthOptions, getAuthMigrations } from './better-auth-schema.js'
import { generateSchemaTypes, type CodegenResult } from './db-codegen.js'
import { generateZodTypes, type ZodCodegenResult } from './zod-codegen.js'
import { createCoercionPlugin, type CoercionMap } from './coercion-plugin.js'
import { tableCreationSql } from './schema-sql.js'
import { SqliteMigrationExecutor } from './sqlite/sqlite-migrator.js'
import { SqliteIntrospector } from './sqlite/sqlite-introspector.js'
import { createSqliteKysely } from './sqlite/sqlite-kysely.js'
import { loadSqliteRuntime } from './sqlite/sqlite-runtime.js'
import { devSeed as runDevSeed, type DevSeedResult } from './sqlite/dev-seed.js'
import { PostgresMigrationExecutor } from './postgres/postgres-migrator.js'
import { createPGliteKysely } from './postgres/pglite-kysely.js'
import { PostgresIntrospector } from './postgres/postgres-introspector.js'
import type { UserConfigShape } from '../commands/db-shared.js'

// ─── Resolved DB descriptors ─────────────────────────────────────────────────

interface ResolvedDbBase {
  rootDir: string
  migrationsDir: string
  schemaFile: string
  coercionFile: string
  manifestFile: string
  classificationMapFile: string
  schemaJsonFile: string
  classificationsFile: string
  classificationsGenJsonFile: string
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

export interface ResolvedSqliteDb extends ResolvedDbBase {
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
   * `pgliteExtensions` in the project's config. See
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

export type ResolvedDb = ResolvedSqliteDb | ResolvedPostgresDb

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Parse a DATABASE_URL string into the subset of UserConfigShape that resolveDb understands.
 * - postgres(ql):// → { postgresUrl }
 * - libsql:// or http(s):// → {} (remote, not handled by the CLI layer)
 * - anything else → { sqliteDb } (local file path)
 */
export function parseDatabaseUrl(
  url: string
): Pick<UserConfigShape, 'sqliteDb' | 'postgresUrl'> {
  if (/^postgres(ql)?:\/\//.test(url)) return { postgresUrl: url }
  if (/^(libsql|https?):\/\//.test(url)) return {}
  return { sqliteDb: url }
}

/**
 * Resolve a UserConfigShape into an absolute-path descriptor.
 * Returns null when neither sqliteDb nor postgresUrl is configured.
 */
export function resolveDb(
  userConfig: UserConfigShape,
  rootDir: string,
  outDir: string,
  runtimeDir?: string,
  dbConfig?: { schema?: string; defaultSchema?: string } | string
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
    classificationMapFile: join(outDir, 'db', 'classification-map.gen.d.ts'),
    schemaJsonFile: join(outDir, 'db', 'pikku-db-schema.gen.json'),
    enumsFile: join(outDir, 'db', 'enums.gen.ts'),
    classificationsFile: join(rootDir, 'db', 'annotations.ts'),
    // Compiled sidecar lives beside the authored annotations.ts in db/ — this is
    // where both consumers read it: the codegen's loadAnnotations() and the
    // pikku-console addon (db/annotations.gen.json). Writing it into outDir
    // (.pikku) would leave both readers looking at a file that never appears.
    classificationsGenJsonFile: join(rootDir, 'db', 'annotations.gen.json'),
    zodFile: join(outDir, 'db', 'zod.gen.ts'),
    camelCase: true,
    defaultSchema,
  })

  if (userConfig.postgresUrl && userConfig.sqliteDb) {
    throw new Error(
      'Both postgresUrl and sqliteDb are set. Configure exactly one database dialect.'
    )
  }

  const pgliteExtensions = userConfig.pgliteExtensions ?? []

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
      ...base('db/sqlite'),
    }
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

/** @deprecated Use resolveDb(userConfig, ...) instead. */
export function resolveLocalDb(
  sqliteDb: string | undefined,
  rootDir: string,
  outDir: string,
  runtimeDir?: string
): ResolvedSqliteDb | null {
  if (!sqliteDb) return null
  const result = resolveDb({ sqliteDb }, rootDir, outDir, runtimeDir)
  return result as ResolvedSqliteDb | null
}

function resolveAgainst(root: string, p: string): string {
  return isAbsolute(p) ? p : resolve(root, p)
}

interface PostgresQueryClient {
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

  const [{ PGlite }, { pgcrypto }, wasm, declared] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite/contrib/pgcrypto'),
    embeddedPostgresWasm,
    loadPGliteExtensions(context.rootDir, context.pgliteExtensions),
  ])

  return new PGlite({
    ...(dataDir ? { dataDir } : {}),
    ...wasm,
    extensions: {
      pgcrypto,
      ...declared,
    },
  })
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
      `so every extension your migrations use has to be declared as ` +
      `pgliteExtensions in createConfig — e.g. pgliteExtensions: ['${name}'] ` +
      `for a PGlite contrib extension, or the package that publishes it ` +
      `('@electric-sql/pglite-pgvector' for pgvector).` +
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

async function withPostgresClient<T>(
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
  classificationsScaffolded: boolean
  classificationsJsonWritten: boolean
}

export interface MigrateAndCodegenOptions {
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
   * and it needs no `CREATEDB` privilege anywhere).
   */
  scratch?: boolean
}

export async function migrateAndCodegen(
  resolved: ResolvedDb,
  options: MigrateAndCodegenOptions = {}
): Promise<MigrateAndCodegenOutcome> {
  let migrateResult!: MigrateResult
  let codegenResult!: CodegenResult

  // Compile any authored db/annotations.ts → sidecar BEFORE codegen so edits
  // reflect in a single `db migrate` (codegen reads the sidecar).
  compileClassifications(
    resolved.classificationsFile,
    resolved.classificationsGenJsonFile
  )

  if (resolved.dialect === 'sqlite') {
    const runtime = await loadSqliteRuntime()
    if (!options.scratch) {
      mkdirSync(dirname(resolved.dbFile), { recursive: true })
    }
    const db = runtime.open(options.scratch ? ':memory:' : resolved.dbFile)
    try {
      const executor = new SqliteMigrationExecutor(db)
      migrateResult = await migrate(executor, resolved.migrationsDir)
      const introspector = new SqliteIntrospector(db)
      codegenResult = await generateSchemaTypes(introspector, {
        outFile: resolved.schemaFile,
        coercionFile: resolved.coercionFile,
        manifestFile: resolved.manifestFile,
        classificationMapFile: resolved.classificationMapFile,
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
        migrateResult = await migrate(executor, resolved.migrationsDir)
        codegenResult = await generateSchemaTypes(introspector, {
          outFile: resolved.schemaFile,
          coercionFile: resolved.coercionFile,
          manifestFile: resolved.manifestFile,
          classificationMapFile: resolved.classificationMapFile,
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
  })

  // ── Classifications step ──────────────────────────────────────────────────
  // Scaffold the authored file if missing (needs the table list), then compile
  // it to the sidecar so a freshly-scaffolded file is captured too.
  const scaffolded = scaffoldClassificationsFile(
    resolved.classificationsFile,
    codegenResult.tables
  )
  const jsonWritten = compileClassifications(
    resolved.classificationsFile,
    resolved.classificationsGenJsonFile
  )

  return {
    migrate: migrateResult,
    codegen: codegenResult,
    zod: zodResult,
    classificationsScaffolded: scaffolded,
    classificationsJsonWritten: jsonWritten,
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
    const runtime = await loadSqliteRuntime()
    const db = runtime.open(resolved.dbFile)
    try {
      return runDevSeed(db, resolved.devSeedFile)
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

  await withPostgresClient(resolved, async (client) => {
    if (typeof client.exec === 'function') {
      await client.exec(sql)
    } else {
      await client.query(sql)
    }
  })

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
    if (existsSync(resolved.dbFile)) {
      rmSync(resolved.dbFile)
    }
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

// ── Classification sync ───────────────────────────────────────────────────────

/**
 * If `db/annotations.ts` doesn't exist yet, write a scaffold listing every
 * table/column so the developer has a typed starting point. Every field of
 * `ColumnEntry` is optional, so the empty-per-table scaffold is valid and means
 * "everything default `private`". Returns whether a scaffold was written.
 */
function scaffoldClassificationsFile(
  classificationsFile: string,
  tableNames: string[]
): boolean {
  if (existsSync(classificationsFile)) return false

  const relMap = join(
    dirname(classificationsFile),
    '..',
    '.pikku',
    'db',
    'classification-map.gen.d.ts'
  )
  const relMapPosix = relMap.replace(/\\/g, '/')

  const groups = new Map<string, string[]>()
  for (const name of tableNames) {
    const dot = name.indexOf('.')
    const schema = dot >= 0 ? name.slice(0, dot) : ''
    const table = dot >= 0 ? name.slice(dot + 1) : name
    if (!groups.has(schema)) groups.set(schema, [])
    groups.get(schema)!.push(table)
  }

  const bodyLines: string[] = [
    `import type { DbClassificationMap } from '${relMapPosix}'`,
    ``,
    `export const classifications = {`,
  ]
  for (const [schema, tables] of groups) {
    if (schema) bodyLines.push(`  ${JSON.stringify(schema)}: {`)
    for (const table of tables) {
      bodyLines.push(
        schema
          ? `    ${JSON.stringify(table)}: {`
          : `  ${JSON.stringify(table)}: {`
      )
      bodyLines.push(schema ? `    },` : `  },`)
    }
    if (schema) bodyLines.push(`  },`)
  }
  bodyLines.push(`} satisfies DbClassificationMap`, ``)

  mkdirSync(dirname(classificationsFile), { recursive: true })
  writeFileSync(classificationsFile, bodyLines.join('\n'), 'utf8')
  return true
}

/**
 * Compile `db/annotations.ts` into the `annotations.gen.json` sidecar that the
 * codegen and the pikku-console addon read. No-op if the authored file doesn't
 * exist (nothing to compile yet). Returns whether the sidecar changed on disk.
 *
 * Uses esbuild (a CLI dependency) to transpile the TS in-process and a `vm`
 * sandbox to evaluate it — no subprocess and no tsx. The previous `node --import
 * tsx/esm` subprocess silently fails on Node ≥ 23 (ERR_REQUIRE_CYCLE_MODULE),
 * which is why this sidecar never materialised before.
 *
 * Run BEFORE codegen so authored edits reflect in a single `db migrate` (and
 * again after, to capture a freshly-scaffolded file).
 */
function compileClassifications(
  classificationsFile: string,
  genJsonFile: string
): boolean {
  if (!existsSync(classificationsFile)) return false

  let value: unknown
  try {
    const src = readFileSync(classificationsFile, 'utf8')
    const { code } = transformSync(src, {
      loader: 'ts',
      format: 'cjs',
    })
    const mod: { exports: Record<string, unknown> } = { exports: {} }
    runInNewContext(code, {
      module: mod,
      exports: mod.exports,
      require: createRequire(classificationsFile),
    })
    value = Object.values(mod.exports)[0]
  } catch {
    return false // syntax/transform error — skip JSON emit
  }

  if (value === undefined) return false
  const next = JSON.stringify(value, null, 2) + '\n'
  const existing = existsSync(genJsonFile)
    ? readFileSync(genJsonFile, 'utf8')
    : null
  if (existing !== next) {
    mkdirSync(dirname(genJsonFile), { recursive: true })
    writeFileSync(genJsonFile, next, 'utf8')
    return true
  }
  return false
}

export async function createKysely<DB>(
  resolved: ResolvedDb
): Promise<Kysely<DB>> {
  const coercionMap = await loadCoercionPlugin(resolved.coercionFile)
  const plugins = coercionMap
    ? [createCoercionPlugin({ map: coercionMap })]
    : []

  if (resolved.dialect === 'sqlite') {
    mkdirSync(dirname(resolved.dbFile), { recursive: true })
    const runtime = await loadSqliteRuntime()
    return createSqliteKysely<DB>({
      db: runtime.open(resolved.dbFile),
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
      dialect: new PostgresDialect({ pool }),
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
 * How an introspected schema map keys a table in a given schema.
 *
 * Introspection elides `public`, so the key for a table there is the bare name.
 * Anything else carries its qualifier.
 */
function qualifiedTableKey(schema: string, table: string): string {
  return schema === 'public' ? table : `${schema}.${table}`
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
 * Auth, the pikku runtime, an addon.
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
  srcDirectories: string[],
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
        srcDirectories,
        kysely,
        logger,
      })
      if (!options) return null

      const { runMigrations, compileMigrations } =
        await getAuthMigrations(options)
      await runMigrations()
      const tables = await postgresDatabaseToMap(scratchDb)
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
  srcDirectories: string[],
  logger: { error: (msg: string) => void }
): Promise<DesiredAuthSchema | null> {
  const runtime = await loadSqliteRuntime()
  const db = runtime.open(':memory:')
  try {
    const kysely = createSqliteKysely({ db, camelCase: true })
    const options = await loadAuthOptions({
      rootDir,
      srcDirectories,
      kysely,
      logger,
    })
    if (!options) return null
    if (isPostgresAuthDatabase(options)) {
      if (resolved.dialect !== 'postgres') {
        throw new Error(
          'Better Auth database.type is postgres, but the resolved app database is not postgres.'
        )
      }
      return desiredPostgresAuthSchema(
        resolved,
        rootDir,
        srcDirectories,
        logger
      )
    }
    const { runMigrations, compileMigrations } =
      await getAuthMigrations(options)
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
  srcDirectories: string[],
  logger: { error: (msg: string) => void }
): Promise<boolean> {
  const options = await loadAuthOptions({
    rootDir,
    srcDirectories,
    kysely,
    logger,
  })
  if (!options) return false
  const { runMigrations } = await getAuthMigrations(options)
  await runMigrations()
  return true
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
 */
export async function desiredRuntimeSchema(
  resolved: ResolvedDb,
  rootDir: string,
  srcDirectories: string[],
  logger: { error: (msg: string) => void }
): Promise<DesiredRuntimeSchema> {
  const skipped: SkippedRuntimeSchema[] = []

  const collect = async (
    db: Kysely<any>,
    introspect: () => Promise<SchemaMap>
  ): Promise<{
    tables: SchemaMap
    schemas: PikkuSchema[]
    types: RequiredTypes
  }> => {
    await applyAuthSchema(db, rootDir, srcDirectories, logger)
    const before = await introspect()

    const { types, unmet } = await resolveRequirements(db)
    for (const { schema, requirement } of unmet) {
      skipped.push({
        schema: schema.name,
        requires: `${requirement.table}.${requirement.column}`,
        owner: requirement.owner,
      })
    }
    const unavailable = new Set(unmet.map(({ schema }) => schema.name))
    const schemas = pikkuSchemas.filter((s) => !unavailable.has(s.name))

    await applyPikkuSchemas(db, schemas)
    const after = await introspect()
    for (const table of before.keys()) after.delete(table)
    return { tables: after, schemas, types }
  }

  if (resolved.dialect === 'sqlite') {
    const runtime = await loadSqliteRuntime()
    const db = runtime.open(':memory:')
    try {
      const kysely = createSqliteKysely({ db, camelCase: true })
      const { tables, schemas, types } = await collect(kysely, () =>
        introspectorToMap(new SqliteIntrospector(db))
      )
      return {
        tables,
        sql: compilePikkuSchemas(kysely, schemas, types),
        skipped,
      }
    } finally {
      db.close()
    }
  }

  return withScratchPostgresDatabase(resolved, async (db) => {
    const kysely = createPGliteKysely<any>({
      db: db.__pglite!,
      camelCase: true,
    })
    try {
      const { tables, schemas, types } = await collect(kysely, () =>
        postgresDatabaseToMap(db)
      )
      return {
        tables,
        sql: compilePikkuSchemas(kysely, schemas, types, resolved.schema),
        skipped,
      }
    } finally {
      await kysely.destroy()
    }
  })
}

export async function introspectSchema(
  resolved: ResolvedDb
): Promise<SchemaMap> {
  if (resolved.dialect === 'sqlite') {
    const runtime = await loadSqliteRuntime()
    const db = runtime.open(resolved.dbFile)
    try {
      return await introspectorToMap(new SqliteIntrospector(db))
    } finally {
      db.close()
    }
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

async function coveredSqliteSchema(migrationsDir: string): Promise<SchemaMap> {
  const runtime = await loadSqliteRuntime()
  const db = runtime.open(':memory:')
  try {
    await migrate(new SqliteMigrationExecutor(db), migrationsDir)
    return await introspectorToMap(new SqliteIntrospector(db))
  } finally {
    db.close()
  }
}

async function coveredPostgresSchema(
  migrationsDir: string,
  context: PGliteExtensionContext
): Promise<SchemaMap> {
  return withScratchPostgresDatabase(context, async (client) => {
    await migrate(new PostgresMigrationExecutor(client), migrationsDir)
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
  srcDirectories: string[],
  logger: { error: (msg: string) => void }
): Promise<SchemaDriftResult> {
  const covered =
    resolved.dialect === 'sqlite'
      ? await coveredSqliteSchema(resolved.migrationsDir)
      : await coveredPostgresSchema(resolved.migrationsDir, resolved)
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
    srcDirectories,
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
  srcDirectories: string[],
  logger: { error: (msg: string) => void }
): Promise<BaselineResult> {
  const drift = await computeSchemaDrift(
    resolved,
    rootDir,
    srcDirectories,
    logger
  )
  if (!drift.inSync) return { status: 'behind', drift }

  if (resolved.dialect === 'sqlite') {
    const runtime = await loadSqliteRuntime()
    mkdirSync(dirname(resolved.dbFile), { recursive: true })
    const db = runtime.open(resolved.dbFile)
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
  srcDirectories: string[],
  logger: { error: (msg: string) => void }
): Promise<AuthDriftResult> {
  const desired = await desiredAuthSchema(
    resolved,
    rootDir,
    srcDirectories,
    logger
  )
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
 * Better Auth, the pikku runtime, an addon. They differ only in where the
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
   * migration SQL through its own migrator and an addon ships SQL as text —
   * neither goes through the schema builder, so neither can be qualified from
   * here, and claiming otherwise on their behalf would emit a delta that names
   * a table in a schema their `CREATE TABLE` never put it in.
   */
  schema?: string
}

// ─── The addon schema channel ────────────────────────────────────────────────

/**
 * Where an addon publishes its schema, relative to its package root.
 *
 * One more channel beside `.pikku/function`, `.pikku/scopes` and the rest, so a
 * consumer reaches it the same way they do: through the package name, never a
 * path into somebody else's tree.
 */
const ADDON_DB_ARTIFACT = '.pikku/db/pikku-db-meta.gen.json'

/** One dialect's worth of a published schema. */
export interface ExportedSchema {
  sql: string
  tables: Record<string, ColumnInfo[]>
}

/**
 * What an addon publishes: its schema, per dialect it supports.
 *
 * Per-dialect rather than one portable form because there is no portable form —
 * the SQL an addon ships is the SQL it wrote for that engine, and a consumer
 * on a dialect the addon never wrote for is a real incompatibility rather than
 * something to paper over at generate time.
 */
export type SchemaArtifact = Partial<
  Record<ResolvedDb['dialect'], ExportedSchema>
>

/** An addon as the consumer wired it. */
export interface AddonDeclaration {
  package: string
  /**
   * A `wireRemoteAddon` addon runs on another host, against that host's
   * database. Its tables are not this project's to create.
   */
  remote?: boolean
}

const serializeSchemaMap = (tables: SchemaMap): Record<string, ColumnInfo[]> =>
  Object.fromEntries(
    [...tables].map(([table, columns]) => [table, [...columns.values()]])
  )

const deserializeSchemaMap = (
  tables: Record<string, ColumnInfo[]>
): SchemaMap =>
  new Map(
    Object.entries(tables).map(([table, columns]) => [
      table,
      new Map(columns.map((column) => [column.name, column])),
    ])
  )

const concatMigrations = (migrationsDir: string): string =>
  readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), 'utf8').trim())
    .join('\n\n')

/**
 * Materialize this package's own migrations into something a consumer can use.
 *
 * The producer half of the addon channel, and the same trick the auth and
 * runtime sources use: run the SQL into a throwaway database and introspect it,
 * so the artifact answers both "what must exist" and "what creates it" without
 * a second, hand-written description that drifts.
 *
 * Every dialect the package has migrations for is exported, not just the one it
 * happens to be configured against — an addon is published once and consumed by
 * projects on either engine.
 */
export async function exportSchema(
  rootDir: string,
  pgliteExtensions: string[] = []
): Promise<SchemaArtifact> {
  const artifact: SchemaArtifact = {}

  const sqliteDir = join(rootDir, 'db', 'sqlite')
  if (existsSync(sqliteDir)) {
    artifact.sqlite = {
      sql: concatMigrations(sqliteDir),
      tables: serializeSchemaMap(await coveredSqliteSchema(sqliteDir)),
    }
  }

  const postgresDir = join(rootDir, 'db', 'postgres')
  if (existsSync(postgresDir)) {
    artifact.postgres = {
      sql: concatMigrations(postgresDir),
      tables: serializeSchemaMap(
        await coveredPostgresSchema(postgresDir, { rootDir, pgliteExtensions })
      ),
    }
  }

  return artifact
}

/**
 * The schema every wired addon publishes, as sources.
 *
 * An addon never creates its own tables. It has no database of its own — it
 * runs inside the consumer, against the consumer's — so the only honest place
 * for its DDL is the consumer's own migration history, which is what turning it
 * into a `SchemaSource` achieves.
 */
export async function addonSchemaSources(
  rootDir: string,
  dialect: ResolvedDb['dialect'],
  addons: AddonDeclaration[],
  logger: { error: (msg: string) => void }
): Promise<SchemaSource[]> {
  if (addons.length === 0) return []

  const require = createRequire(join(rootDir, 'package.json'))
  const sources: SchemaSource[] = []
  const seen = new Set<string>()

  for (const addon of addons) {
    if (addon.remote || seen.has(addon.package)) continue
    seen.add(addon.package)

    let artifactPath: string
    try {
      artifactPath = require.resolve(`${addon.package}/${ADDON_DB_ARTIFACT}`)
    } catch {
      // Most addons have no schema at all, so an unresolvable artifact is the
      // ordinary case and says nothing is contributed — not that anything failed.
      continue
    }

    const artifact = JSON.parse(
      readFileSync(artifactPath, 'utf8')
    ) as SchemaArtifact
    const exported = artifact[dialect]
    if (!exported) {
      logger.error(
        `The '${addon.package}' addon publishes a schema, but not for ${dialect} — ` +
          `it supports ${Object.keys(artifact).join(', ') || 'no dialect'}. ` +
          'Its tables cannot be created here, so its services will fail at runtime.'
      )
      continue
    }

    sources.push({
      name: addon.package.replace(/^@/, '').replace(/[^a-zA-Z0-9]+/g, '-'),
      desired: {
        tables: deserializeSchemaMap(exported.tables),
        sql: exported.sql,
      },
      origin: `the '${addon.package}' addon`,
    })
  }

  return sources
}

/**
 * Every schema source the project has, in the order they must be applied.
 *
 * Auth comes first because the runtime's scope tables reference its `user`
 * table; addons come last because they may reference either.
 */
export async function schemaSources(
  resolved: ResolvedDb,
  rootDir: string,
  srcDirectories: string[],
  logger: { error: (msg: string) => void },
  addons: AddonDeclaration[] = []
): Promise<SchemaSource[]> {
  const sources: SchemaSource[] = []

  const auth = await desiredAuthSchema(
    resolved,
    rootDir,
    srcDirectories,
    logger
  )
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
    srcDirectories,
    logger
  )
  if (runtime.tables.size > 0) {
    sources.push({
      name: 'pikku-runtime',
      desired: runtime,
      origin: "@pikku/kysely's runtime services",
      schema: resolved.dialect === 'postgres' ? resolved.schema : undefined,
    })
  }

  sources.push(
    ...(await addonSchemaSources(rootDir, resolved.dialect, addons, logger))
  )

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
  columns: ColumnInfo[]
): { sql: string[]; needsBackfill: string[] } {
  const sql: string[] = []
  const needsBackfill: string[] = []

  for (const column of columns) {
    const parts = [
      `ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.type}`,
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

export interface GeneratedMigration {
  source: string
  file: string
  /** Columns the migration adds that need a backfill decision before it is applied. */
  needsBackfill: string[]
}

export interface GenerateResult {
  /** Sources whose tables the migrations already cover. */
  upToDate: string[]
  written: GeneratedMigration[]
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
 * what enabling a Better Auth plugin or upgrading an addon produces — has
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
  srcDirectories: string[],
  logger: { error: (msg: string) => void },
  addons: AddonDeclaration[] = []
): Promise<GenerateResult> {
  const sources = await schemaSources(
    resolved,
    rootDir,
    srcDirectories,
    logger,
    addons
  )
  const result: GenerateResult = { upToDate: [], written: [] }

  for (const source of sources) {
    // Re-read after each write: a migration just written for an earlier source
    // is part of what the next one is compared against.
    const covered =
      resolved.dialect === 'sqlite'
        ? await coveredSqliteSchema(resolved.migrationsDir)
        : await coveredPostgresSchema(resolved.migrationsDir, resolved)

    const { missingTables, missingColumns } = diffSchemas(
      source.desired.tables,
      covered,
      source.schema
    )
    if (missingTables.length === 0 && missingColumns.length === 0) {
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

    // The source's own SQL is already qualified when it can be; the delta below
    // is written here from bare introspected names, so it has to be qualified
    // to match, or it alters a table in whichever schema `search_path` finds.
    // Quoted, because the compiled SQL this delta has to line up with goes
    // through the schema builder and is quoted there. `db.schema: "App"` left
    // raw folds to `app`, so the delta would alter a table in a schema the
    // runtime never uses.
    const qualify = (table: string) =>
      source.schema ? `${quoteIdentifier(source.schema)}.${table}` : table

    if (!partial) {
      body = source.desired.sql
    } else {
      const statements: string[] = []
      for (const table of missingTables) {
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
                (c) => `  ${c.name} ${c.type}${c.notNull ? ' NOT NULL' : ''}`
              )
              .join(',\n') +
            '\n);'
        )
      }
      for (const { table, columns } of missingColumns) {
        const infos = columns
          .map((name) => source.desired.tables.get(table)?.get(name))
          .filter((c): c is ColumnInfo => c !== undefined)
        const added = addColumnStatements(qualify(table), infos)
        statements.push(...added.sql)
        needsBackfill.push(...added.needsBackfill)
      }
      body = statements.join('\n\n')
    }

    const file = nextMigrationFile(resolved.migrationsDir, source.name)
    const header =
      `-- Generated by \`pikku db generate\` from ${source.origin}.\n` +
      '-- Re-run the command after changing that source.\n\n'
    writeFileSync(file, header + body + '\n', 'utf8')
    result.written.push({ source: source.name, file, needsBackfill })
  }

  return result
}
