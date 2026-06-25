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
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely'
import type { PGlite } from '@electric-sql/pglite'
import { migrate, type MigrateResult } from './db-migrator.js'
import type { DbIntrospector } from './db-introspector.js'
import { loadAuthOptions, getAuthMigrations } from './better-auth-schema.js'
import { generateSchemaTypes, type CodegenResult } from './db-codegen.js'
import { generateZodTypes, type ZodCodegenResult } from './zod-codegen.js'
import { createCoercionPlugin, type CoercionMap } from './coercion-plugin.js'
import { SqliteMigrationExecutor } from './sqlite/sqlite-migrator.js'
import { SqliteIntrospector } from './sqlite/sqlite-introspector.js'
import { createSqliteKysely } from './sqlite/sqlite-kysely.js'
import { loadSqliteRuntime } from './sqlite/sqlite-runtime.js'
import { seed as runSeed, type SeedResult } from './sqlite/seed.js'
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
}

export interface ResolvedSqliteDb extends ResolvedDbBase {
  dialect: 'sqlite'
  dbFile: string
  runtimeDir: string
  seedFile: string
}

export interface ResolvedPostgresDb extends ResolvedDbBase {
  dialect: 'postgres'
  mode: 'url' | 'pglite'
  connectionString?: string
  pgliteDir?: string
  runtimeDir: string
  seedFile: string
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
  runtimeDir?: string
): ResolvedDb | null {
  const resolvedRuntimeDir = runtimeDir
    ? resolveAgainst(rootDir, runtimeDir)
    : join(rootDir, '.pikku-runtime')
  const base = (sub: string): ResolvedDbBase => ({
    rootDir,
    migrationsDir: resolveAgainst(rootDir, sub),
    schemaFile: join(outDir, 'db', 'schema.d.ts'),
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
  })

  if (userConfig.postgresUrl && userConfig.sqliteDb) {
    throw new Error(
      'Both postgresUrl and sqliteDb are set. Configure exactly one database dialect.'
    )
  }

  if (userConfig.postgresUrl) {
    return {
      dialect: 'postgres',
      mode: 'url',
      connectionString: userConfig.postgresUrl,
      runtimeDir: resolvedRuntimeDir,
      seedFile: resolveAgainst(rootDir, 'db/postgres-seed.sql'),
      ...base('db/postgres'),
    }
  }

  const sqliteDb =
    userConfig.sqliteDb ??
    (existsSync(join(rootDir, 'db/sqlite'))
      ? '.pikku-runtime/dev.db'
      : undefined)

  if (sqliteDb) {
    return {
      dialect: 'sqlite',
      dbFile: resolveAgainst(rootDir, sqliteDb),
      runtimeDir: resolvedRuntimeDir,
      seedFile: resolveAgainst(rootDir, 'db/sqlite-seed.sql'),
      ...base('db/sqlite'),
    }
  }

  if (existsSync(join(rootDir, 'db/postgres'))) {
    return {
      dialect: 'postgres',
      mode: 'pglite',
      pgliteDir: join(resolvedRuntimeDir, 'dev-postgres'),
      runtimeDir: resolvedRuntimeDir,
      seedFile: resolveAgainst(rootDir, 'db/postgres-seed.sql'),
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
  const db = await createEmbeddedPostgres(resolved.pgliteDir)
  return pgliteAsClient(db)
}

async function createEmbeddedPostgres(dataDir?: string): Promise<PGlite> {
  const [{ PGlite }, { pgcrypto }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite/contrib/pgcrypto'),
  ])

  return new PGlite({
    ...(dataDir ? { dataDir } : {}),
    extensions: {
      pgcrypto,
    },
  })
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

export async function migrateAndCodegen(
  resolved: ResolvedDb
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
    mkdirSync(dirname(resolved.dbFile), { recursive: true })
    const runtime = await loadSqliteRuntime()
    const db = runtime.open(resolved.dbFile)
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
        rootDir: resolved.rootDir,
        dialect: 'sqlite',
      })
    } finally {
      db.close()
    }
  } else {
    await withPostgresClient(resolved, async (client) => {
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
          rootDir: resolved.rootDir,
          dialect: 'postgres',
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

export async function seed(resolved: ResolvedDb): Promise<SeedResult> {
  if (resolved.dialect === 'sqlite') {
    const runtime = await loadSqliteRuntime()
    const db = runtime.open(resolved.dbFile)
    try {
      return runSeed(db, resolved.seedFile)
    } finally {
      db.close()
    }
  }

  if (!existsSync(resolved.seedFile)) {
    return { applied: false, bytes: 0 }
  }

  const sql = readFileSync(resolved.seedFile, 'utf8')
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
      const quoted = `"${schemaName.replace(/"/g, '""')}"`
      await client.query(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`)
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
    db: await createEmbeddedPostgres(resolved.pgliteDir),
    camelCase: resolved.camelCase,
    plugins,
  })
}

type SchemaMap = Map<string, Set<string>>

async function introspectorToMap(intro: DbIntrospector): Promise<SchemaMap> {
  const map: SchemaMap = new Map()
  for (const table of await intro.listTables()) {
    const cols = await intro.getColumns(table)
    map.set(table, new Set(cols.map((c) => c.name)))
  }
  return map
}

function diffSchemas(
  desired: SchemaMap,
  actual: SchemaMap
): {
  missingTables: string[]
  missingColumns: { table: string; columns: string[] }[]
} {
  const missingTables: string[] = []
  const missingColumns: { table: string; columns: string[] }[] = []

  const findSchemaQualifiedMatch = (table: string): Set<string> | undefined => {
    if (table.includes('.')) return undefined
    const matches = [...actual.entries()].filter(([actualTable]) => {
      const parts = actualTable.split('.')
      return parts.length === 2 && parts[1] === table
    })
    if (matches.length !== 1) return undefined
    return matches[0][1]
  }

  for (const [table, cols] of desired) {
    const actualCols = actual.get(table) ?? findSchemaQualifiedMatch(table)
    if (!actualCols) {
      missingTables.push(table)
      continue
    }
    const missing = [...cols].filter((c) => !actualCols.has(c))
    if (missing.length) missingColumns.push({ table, columns: missing })
  }
  return { missingTables, missingColumns }
}

export interface DesiredAuthSchema {
  tables: SchemaMap
  sql: string
}

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
  _resolved: ResolvedPostgresDb,
  _prefix: string,
  run: (scratchDb: PostgresQueryClient) => Promise<T>
): Promise<T> {
  const scratchDb = await createEmbeddedPostgres()
  try {
    return await run(pgliteAsClient(scratchDb))
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
  resolved: ResolvedPostgresDb,
  rootDir: string,
  srcDirectories: string[],
  logger: { error: (msg: string) => void }
): Promise<DesiredAuthSchema | null> {
  return withScratchPostgresDatabase(
    resolved,
    'pikku_auth',
    async (scratchDb) => {
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
    }
  )
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
  resolved: ResolvedPostgresDb,
  migrationsDir: string
): Promise<SchemaMap> {
  return withScratchPostgresDatabase(
    resolved,
    'pikku_migrate',
    async (client) => {
      await migrate(new PostgresMigrationExecutor(client), migrationsDir)
      return postgresDatabaseToMap(client)
    }
  )
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

export interface GenerateAuthResult {
  status: 'no-auth' | 'up-to-date' | 'written' | 'incremental-unsupported'
  file?: string
  missingTables?: string[]
  missingColumns?: { table: string; columns: string[] }[]
}

export async function generateAuthMigration(
  resolved: ResolvedDb,
  rootDir: string,
  srcDirectories: string[],
  logger: { error: (msg: string) => void }
): Promise<GenerateAuthResult> {
  const desired = await desiredAuthSchema(
    resolved,
    rootDir,
    srcDirectories,
    logger
  )
  if (!desired) return { status: 'no-auth' }

  const covered =
    resolved.dialect === 'sqlite'
      ? await coveredSqliteSchema(resolved.migrationsDir)
      : await coveredPostgresSchema(resolved, resolved.migrationsDir)
  const { missingTables, missingColumns } = diffSchemas(desired.tables, covered)
  if (missingTables.length === 0 && missingColumns.length === 0) {
    return { status: 'up-to-date' }
  }

  const coveredHasAnyAuthTable = [...desired.tables.keys()].some((t) =>
    covered.has(t)
  )
  if (coveredHasAnyAuthTable) {
    return { status: 'incremental-unsupported', missingTables, missingColumns }
  }

  const file = nextMigrationFile(resolved.migrationsDir, 'better-auth')
  const header =
    '-- Generated by `pikku db generate` from pikkuBetterAuth (Better Auth).\n' +
    '-- Re-run the command after changing the auth config.\n\n'
  writeFileSync(file, header + desired.sql + '\n', 'utf8')
  return { status: 'written', file, missingTables }
}
