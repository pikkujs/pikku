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
import { CamelCasePlugin, CompiledQuery, Kysely, PostgresDialect } from 'kysely'
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
  connectionString: string
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
  const base = (sub: string): ResolvedDbBase => ({
    rootDir,
    migrationsDir: resolveAgainst(rootDir, sub),
    schemaFile: join(outDir, 'db', 'schema.d.ts'),
    coercionFile: join(outDir, 'db', 'coercion.gen.ts'),
    manifestFile: join(outDir, 'db', 'classification.gen.ts'),
    classificationMapFile: join(outDir, 'db', 'classification-map.gen.d.ts'),
    schemaJsonFile: join(outDir, 'db', 'pikku-db-schema.gen.json'),
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
      connectionString: userConfig.postgresUrl,
      ...base('db/postgres'),
    }
  }

  const sqliteDb =
    userConfig.sqliteDb ??
    (existsSync(join(rootDir, 'db/sqlite'))
      ? '.pikku-runtime/dev.db'
      : undefined)

  if (sqliteDb) {
    const resolvedRuntimeDir = runtimeDir
      ? resolveAgainst(rootDir, runtimeDir)
      : join(rootDir, '.pikku-runtime')
    return {
      dialect: 'sqlite',
      dbFile: resolveAgainst(rootDir, sqliteDb),
      runtimeDir: resolvedRuntimeDir,
      seedFile: resolveAgainst(rootDir, 'db/sqlite-seed.sql'),
      ...base('db/sqlite'),
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
  let migrateResult: MigrateResult
  let codegenResult: CodegenResult

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
        camelCase: resolved.camelCase,
        rootDir: resolved.rootDir,
        dialect: 'sqlite',
      })
    } finally {
      db.close()
    }
  } else {
    // Postgres
    const introspector = new PostgresIntrospector(resolved.connectionString)
    await introspector.connect()
    try {
      const { Client } = await import('pg')
      const client = new Client({ connectionString: resolved.connectionString })
      await client.connect()
      try {
        const executor = new PostgresMigrationExecutor(client)
        migrateResult = await migrate(executor, resolved.migrationsDir)
        codegenResult = await generateSchemaTypes(introspector, {
          outFile: resolved.schemaFile,
          coercionFile: resolved.coercionFile,
          manifestFile: resolved.manifestFile,
          classificationMapFile: resolved.classificationMapFile,
          schemaJsonFile: resolved.schemaJsonFile,
          camelCase: resolved.camelCase,
          rootDir: resolved.rootDir,
          dialect: 'postgres',
        })
      } finally {
        await client.end()
      }
    } finally {
      await introspector.close()
    }
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

export async function seed(resolved: ResolvedSqliteDb): Promise<SeedResult> {
  const runtime = await loadSqliteRuntime()
  const db = runtime.open(resolved.dbFile)
  try {
    return runSeed(db, resolved.seedFile)
  } finally {
    db.close()
  }
}

export function reset(resolved: ResolvedSqliteDb, rootDir: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `pikku db reset refused: NODE_ENV=production. This command only runs in dev.`
    )
  }
  const rel = relative(resolved.runtimeDir, resolved.dbFile)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `pikku db reset refused: resolved DB file (${resolved.dbFile}) is outside the runtime directory (${resolved.runtimeDir}). Override sqliteDb or set runtimeDir correctly.`
    )
  }
  if (existsSync(resolved.dbFile)) {
    rmSync(resolved.dbFile)
  }
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
  resolved: ResolvedSqliteDb
): Promise<Kysely<DB>> {
  mkdirSync(dirname(resolved.dbFile), { recursive: true })
  const runtime = await loadSqliteRuntime()
  let coercionMap: CoercionMap | undefined
  try {
    const mod = await import(resolved.coercionFile)
    coercionMap = mod.coercionMap as CoercionMap
  } catch {
    // coercion.gen.ts not yet generated — run `pikku db migrate` first
  }
  return createSqliteKysely<DB>({
    db: runtime.open(resolved.dbFile),
    camelCase: resolved.camelCase,
    plugins: coercionMap ? [createCoercionPlugin({ map: coercionMap })] : [],
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
  for (const [table, cols] of desired) {
    const actualCols = actual.get(table)
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

function createScratchPostgresSchemaName(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `pikku_auth_${Date.now().toString(36)}_${random}`
}

async function postgresSchemaToMap(
  connectionString: string,
  schema: string
): Promise<SchemaMap> {
  const { Client } = await import('pg')
  const client = new Client({ connectionString })
  await client.connect()
  try {
    const tablesResult = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schema]
    )
    const map: SchemaMap = new Map()
    for (const { table_name } of tablesResult.rows) {
      const columnsResult = await client.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, table_name]
      )
      map.set(table_name, new Set(columnsResult.rows.map((c) => c.column_name)))
    }
    return map
  } finally {
    await client.end()
  }
}

async function desiredPostgresAuthSchema(
  resolved: ResolvedPostgresDb,
  rootDir: string,
  srcDirectories: string[],
  logger: { error: (msg: string) => void }
): Promise<DesiredAuthSchema | null> {
  const { Pool } = await import('pg')
  const schema = createScratchPostgresSchemaName()
  const pool = new Pool({
    connectionString: resolved.connectionString,
    max: 1,
  })
  try {
    const admin = await pool.connect()
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`)
      await admin.query(`SET search_path TO "${schema}"`)
    } finally {
      admin.release()
    }

    const kysely = new Kysely<any>({
      dialect: new PostgresDialect({
        pool,
        onReserveConnection: async (connection) => {
          await connection.executeQuery(
            CompiledQuery.raw(`SET search_path TO "${schema}"`)
          )
        },
      }),
      plugins: [new CamelCasePlugin()],
    }).withSchema(schema)

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
      const tables = await postgresSchemaToMap(
        resolved.connectionString,
        schema
      )
      const sql = await compileMigrations()
      return { tables, sql }
    } finally {
      await kysely.destroy()
    }
  } finally {
    const cleanup = new Pool({
      connectionString: resolved.connectionString,
      max: 1,
    })
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await cleanup.end()
    }
  }
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
  const intro = new PostgresIntrospector(resolved.connectionString)
  await intro.connect()
  try {
    return await introspectorToMap(intro)
  } finally {
    await intro.close()
  }
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
  status:
    | 'no-auth'
    | 'up-to-date'
    | 'written'
    | 'incremental-unsupported'
    | 'unsupported-dialect'
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
  if (resolved.dialect !== 'sqlite') return { status: 'unsupported-dialect' }

  const desired = await desiredAuthSchema(
    resolved,
    rootDir,
    srcDirectories,
    logger
  )
  if (!desired) return { status: 'no-auth' }

  const covered = await coveredSqliteSchema(resolved.migrationsDir)
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
