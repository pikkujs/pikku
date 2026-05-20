import { DatabaseSync } from 'node:sqlite'
import { existsSync, rmSync } from 'node:fs'
import { resolve, isAbsolute, relative } from 'node:path'
import type { Kysely } from 'kysely'
import {
  createNodeSqliteKysely,
  createCoercionPlugin,
  type CoercionMap,
} from '@pikku/kysely-node-sqlite'
import { migrate, type MigrateResult } from './sql-migrator.js'
import { generateSchemaTypes, type CodegenResult } from './sqlite-codegen.js'
import { seed as runSeed, type SeedResult } from './seed.js'

export type DevDbConfig = true | { file?: string }

export interface ResolvedLocalDb {
  dbFile: string
  migrationsDir: string
  seedFile: string
  schemaFile: string
  coercionFile: string
  camelCase: boolean
}

/**
 * Resolve a DevDbConfig into absolute paths against the project root.
 * All paths apart from `dbFile` are conventional and not configurable.
 */
export function resolveLocalDb(
  config: DevDbConfig | undefined,
  rootDir: string
): ResolvedLocalDb | null {
  if (!config) return null
  const file = config === true ? undefined : config.file
  return {
    dbFile: resolveAgainst(rootDir, file ?? '.pikku/dev.db'),
    migrationsDir: resolveAgainst(rootDir, 'db/migrations'),
    seedFile: resolveAgainst(rootDir, 'db/seed.sql'),
    schemaFile: resolveAgainst(rootDir, 'db/schema.d.ts'),
    coercionFile: resolveAgainst(rootDir, 'db/coercion.gen.ts'),
    camelCase: true,
  }
}

function resolveAgainst(root: string, p: string): string {
  return isAbsolute(p) ? p : resolve(root, p)
}

export interface MigrateAndCodegenOutcome {
  migrate: MigrateResult
  codegen: CodegenResult
}

/**
 * Run the migrate routine (open → tracking-table → drift-check → apply →
 * codegen → close). Used by both `pikku db migrate` and `pikku dev` boot.
 */
export function migrateAndCodegen(
  resolved: ResolvedLocalDb
): MigrateAndCodegenOutcome {
  const db = new DatabaseSync(resolved.dbFile)
  try {
    const migrateResult = migrate(db, resolved.migrationsDir)
    const codegenResult = generateSchemaTypes(db, {
      outFile: resolved.schemaFile,
      coercionFile: resolved.coercionFile,
      camelCase: resolved.camelCase,
      migrationsDir: resolved.migrationsDir,
    })
    return { migrate: migrateResult, codegen: codegenResult }
  } finally {
    db.close()
  }
}

export function seed(resolved: ResolvedLocalDb): SeedResult {
  const db = new DatabaseSync(resolved.dbFile)
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
  const rel = relative(rootDir, resolved.dbFile)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `pikku db reset refused: resolved DB file (${resolved.dbFile}) is outside the project root (${rootDir}). Override dev.db.file or move the file inside the project.`
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
  let coercionMap: CoercionMap | undefined
  try {
    const mod = await import(resolved.coercionFile)
    coercionMap = mod.coercionMap as CoercionMap
  } catch {
    // coercion.gen.ts not yet generated — run `pikku db migrate` first
  }

  return createNodeSqliteKysely<DB>({
    filename: resolved.dbFile,
    camelCase: resolved.camelCase,
    plugins: coercionMap ? [createCoercionPlugin({ map: coercionMap })] : [],
  })
}
