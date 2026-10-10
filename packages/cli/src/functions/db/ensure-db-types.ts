import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { resolveDb, migrateAndCodegen } from './local-db.js'

/**
 * Make sure `db/schema.gen.ts` exists before anything is typechecked.
 *
 * A fresh project's services import `DB` from `#pikku/db/schema.gen.js`, but
 * only `pikku db migrate` / `pikku db codegen` used to write it, so the first
 * `pikku all` failed on a module that had not been generated yet. The types
 * come from the migrations alone (a scratch database), so nothing needs to be
 * reachable. If even that fails, an empty `DB` keeps the import resolvable
 * until `db migrate` writes the real one.
 *
 * MySQL has no embedded engine, so its scratch database lives on a server: the
 * `mysqlUrl` the project's createConfig returns, `db.mysqlUrl`, or a `mysql://`
 * DATABASE_URL. With none of those the server is unknown and nothing is
 * attempted (guessing localhost could land on someone's real database), so the
 * stub is written until `pikku db migrate` runs.
 */
export async function ensureDbTypes(
  rootDir: string,
  outDir: string,
  runtimeDir?: string,
  dbConfig?: Parameters<typeof resolveDb>[4],
  userConfig?: { mysqlUrl?: string }
): Promise<'present' | 'generated' | 'stubbed' | 'no-db'> {
  const declaredMysqlUrl =
    userConfig?.mysqlUrl ??
    (typeof dbConfig === 'object'
      ? (dbConfig as { mysqlUrl?: string }).mysqlUrl
      : undefined) ??
    (/^mysql:\/\//.test(process.env.DATABASE_URL ?? '')
      ? process.env.DATABASE_URL
      : undefined)
  const mysqlOnly =
    existsSync(join(rootDir, 'db', 'mysql')) &&
    !existsSync(join(rootDir, 'db', 'sqlite'))
  // Resolves the schema file's location only; it is never connected to.
  const serverKnown = declaredMysqlUrl !== undefined
  const mysqlUrl =
    declaredMysqlUrl ??
    (mysqlOnly ? 'mysql://unconfigured.invalid/' : undefined)
  const resolved = resolveDb(
    mysqlUrl ? { mysqlUrl } : {},
    rootDir,
    outDir,
    runtimeDir,
    dbConfig
  )
  if (!resolved) return 'no-db'
  if (existsSync(resolved.schemaFile)) return 'present'
  if (resolved.dialect !== 'mysql' || serverKnown) {
    try {
      await migrateAndCodegen(resolved, { scratch: true })
      if (existsSync(resolved.schemaFile)) return 'generated'
    } catch {}
  }
  mkdirSync(dirname(resolved.schemaFile), { recursive: true })
  writeFileSync(resolved.schemaFile, 'export interface DB {}\n', 'utf8')
  return 'stubbed'
}
