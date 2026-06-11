import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs'
import { resolve, isAbsolute, relative, dirname, join } from 'node:path'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
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
    classificationsGenJsonFile: join(outDir, 'db', 'annotations.gen.json'),
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
  classificationsScaffolded: boolean
  classificationsJsonWritten: boolean
}

export async function migrateAndCodegen(
  resolved: ResolvedDb
): Promise<MigrateAndCodegenOutcome> {
  let migrateResult: MigrateResult
  let codegenResult: CodegenResult

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
        migrationsDir: resolved.migrationsDir,
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
          migrationsDir: resolved.migrationsDir,
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
  })

  // ── Classifications step ──────────────────────────────────────────────────
  const { scaffolded, jsonWritten } = syncClassifications(
    resolved.classificationsFile,
    resolved.classificationsGenJsonFile,
    codegenResult.tables
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
 * Loads `db/classifications.ts` via tsx, serialises it to
 * `.pikku/db/classifications.gen.json` for runtime consumption (console, etc.).
 *
 * If `db/classifications.ts` doesn't exist yet, writes a scaffold with every
 * table defaulting to `private` so the developer has a starting point.
 */
function syncClassifications(
  classificationsFile: string,
  genJsonFile: string,
  tableNames: string[]
): { scaffolded: boolean; jsonWritten: boolean } {
  let scaffolded = false

  if (!existsSync(classificationsFile)) {
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
    scaffolded = true
  }

  // Resolve tsx from the CLI package's own node_modules so it works regardless
  // of whether the user's project has tsx installed.
  const _require = createRequire(fileURLToPath(import.meta.url))
  let tsxEsmPath: string | null = null
  try {
    tsxEsmPath = _require.resolve('tsx/esm')
  } catch {
    // tsx not bundled with this CLI install — skip JSON emit
  }

  const script = [
    `import * as mod from ${JSON.stringify(classificationsFile)}`,
    `const val = Object.values(mod)[0]`,
    `process.stdout.write(JSON.stringify(val))`,
  ].join('\n')

  let jsonWritten = false
  if (tsxEsmPath) {
    try {
      const json = execSync(
        `node --import ${JSON.stringify(tsxEsmPath)} --input-type=module`,
        {
          input: script,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      )
      const existing = existsSync(genJsonFile)
        ? readFileSync(genJsonFile, 'utf8')
        : null
      const next = JSON.stringify(JSON.parse(json), null, 2) + '\n'
      if (existing !== next) {
        mkdirSync(dirname(genJsonFile), { recursive: true })
        writeFileSync(genJsonFile, next, 'utf8')
        jsonWritten = true
      }
    } catch {
      // annotations file has syntax errors — skip JSON emit
    }
  }

  return { scaffolded, jsonWritten }
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
