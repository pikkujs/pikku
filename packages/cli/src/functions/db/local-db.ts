import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, isAbsolute, relative, dirname, join } from 'node:path'
import type { Kysely } from 'kysely'
import { migrate, type MigrateResult } from './sql-migrator.js'
import { generateSchemaTypes, type CodegenResult } from './sqlite-codegen.js'
import { generateZodTypes, type ZodCodegenResult } from './zod-codegen.js'
import { seed as runSeed, type SeedResult } from './seed.js'
import { createCoercionPlugin, type CoercionMap } from './coercion-plugin.js'
import { createSqliteKysely } from './sqlite-kysely.js'
import { loadSqliteRuntime } from './sqlite-runtime.js'

export interface ResolvedLocalDb {
  dbFile: string
  runtimeDir: string
  migrationsDir: string
  seedFile: string
  schemaFile: string
  coercionFile: string
  zodFile: string
  camelCase: boolean
}

/**
 * Resolve a sqliteDb path into absolute paths.
 * - sqliteDb is the file path (relative to rootDir or absolute); if undefined, returns null
 * - dbFile resolves to the absolute path of the SQLite file
 * - schema/coercion/zod are generated into outDir/db
 * - migrations and seed are authored source under rootDir/db
 */
export function resolveLocalDb(
  sqliteDb: string | undefined,
  rootDir: string,
  outDir: string,
  runtimeDir?: string
): ResolvedLocalDb | null {
  if (!sqliteDb) return null
  const resolvedRuntimeDir = runtimeDir ?? join(rootDir, '.pikku-runtime')
  return {
    dbFile: resolveAgainst(rootDir, sqliteDb),
    runtimeDir: resolvedRuntimeDir,
    migrationsDir: resolveAgainst(rootDir, 'db/migrations'),
    seedFile: resolveAgainst(rootDir, 'db/seed.sql'),
    schemaFile: join(outDir, 'db', 'schema.d.ts'),
    coercionFile: join(outDir, 'db', 'coercion.gen.ts'),
    zodFile: join(outDir, 'db', 'zod.gen.ts'),
    camelCase: true,
  }
}

function resolveAgainst(root: string, p: string): string {
  return isAbsolute(p) ? p : resolve(root, p)
}

export interface MigrateAndCodegenOutcome {
  migrate: MigrateResult
  codegen: CodegenResult
  zod: ZodCodegenResult
}

/**
 * Run the migrate routine (open → tracking-table → drift-check → apply →
 * codegen → close). Used by both `pikku db migrate` and `pikku dev` boot.
 */
export async function migrateAndCodegen(
  resolved: ResolvedLocalDb
): Promise<MigrateAndCodegenOutcome> {
  mkdirSync(dirname(resolved.dbFile), { recursive: true })
  const runtime = await loadSqliteRuntime()
  const db = runtime.open(resolved.dbFile)
  try {
    const migrateResult = migrate(db, resolved.migrationsDir)
    const codegenResult = generateSchemaTypes(db, {
      outFile: resolved.schemaFile,
      coercionFile: resolved.coercionFile,
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

export async function seed(resolved: ResolvedLocalDb): Promise<SeedResult> {
  const runtime = await loadSqliteRuntime()
  const db = runtime.open(resolved.dbFile)
  try {
    return runSeed(db, resolved.seedFile)
  } finally {
    db.close()
  }
}

/**
 * Delete the dev DB file. Refuses if NODE_ENV is 'production' or the
 * resolved file lives outside the project root (defensive against
 * misconfigured absolute paths).
 */
export function reset(resolved: ResolvedLocalDb, rootDir: string): void {
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

/**
 * Construct the user-facing Kysely instance for the dev DB. Used by
 * `pikku dev` to populate inMemoryServices.kysely.
 * Wires the coercion plugin when db/coercion.gen.ts exists.
 */
export async function createKysely<DB>(
  resolved: ResolvedLocalDb
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
