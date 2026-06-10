import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, isAbsolute, relative, dirname, join } from 'node:path'
import type { Kysely } from 'kysely'
import { migrate, type MigrateResult } from './db-migrator.js'
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
  migrationsDir: string
  schemaFile: string
  coercionFile: string
  manifestFile: string
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
    migrationsDir: resolveAgainst(rootDir, sub),
    schemaFile: join(outDir, 'db', 'schema.d.ts'),
    coercionFile: join(outDir, 'db', 'coercion.gen.ts'),
    manifestFile: join(outDir, 'db', 'classification.gen.ts'),
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

  if (userConfig.sqliteDb) {
    const resolvedRuntimeDir = runtimeDir
      ? resolveAgainst(rootDir, runtimeDir)
      : join(rootDir, '.pikku-runtime')
    return {
      dialect: 'sqlite',
      dbFile: resolveAgainst(rootDir, userConfig.sqliteDb),
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
}

export async function migrateAndCodegen(
  resolved: ResolvedDb
): Promise<MigrateAndCodegenOutcome> {
  if (resolved.dialect === 'sqlite') {
    mkdirSync(dirname(resolved.dbFile), { recursive: true })
    const runtime = await loadSqliteRuntime()
    const db = runtime.open(resolved.dbFile)
    try {
      const executor = new SqliteMigrationExecutor(db)
      const migrateResult = await migrate(executor, resolved.migrationsDir)
      const introspector = new SqliteIntrospector(db)
      const codegenResult = await generateSchemaTypes(introspector, {
        outFile: resolved.schemaFile,
        coercionFile: resolved.coercionFile,
        manifestFile: resolved.manifestFile,
        camelCase: resolved.camelCase,
        migrationsDir: resolved.migrationsDir,
      })
      const zodResult = generateZodTypes({
        schemaFile: resolved.schemaFile,
        outFile: resolved.zodFile,
      })
      return { migrate: migrateResult, codegen: codegenResult, zod: zodResult }
    } finally {
      db.close()
    }
  }

  // Postgres
  const introspector = new PostgresIntrospector(resolved.connectionString)
  await introspector.connect()
  try {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: resolved.connectionString })
    await client.connect()
    try {
      const executor = new PostgresMigrationExecutor(client)
      const migrateResult = await migrate(executor, resolved.migrationsDir)
      const codegenResult = await generateSchemaTypes(introspector, {
        outFile: resolved.schemaFile,
        coercionFile: resolved.coercionFile,
        manifestFile: resolved.manifestFile,
        camelCase: resolved.camelCase,
        migrationsDir: resolved.migrationsDir,
      })
      const zodResult = generateZodTypes({
        schemaFile: resolved.schemaFile,
        outFile: resolved.zodFile,
      })
      return { migrate: migrateResult, codegen: codegenResult, zod: zodResult }
    } finally {
      await client.end()
    }
  } finally {
    await introspector.close()
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
