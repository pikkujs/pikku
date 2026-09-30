import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'
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
 */
export async function ensureDbTypes(
  rootDir: string,
  outDir: string,
  runtimeDir?: string,
  dbConfig?: Parameters<typeof resolveDb>[4]
): Promise<'present' | 'generated' | 'stubbed' | 'no-db'> {
  const resolved = resolveDb({}, rootDir, outDir, runtimeDir, dbConfig)
  if (!resolved) return 'no-db'
  if (existsSync(resolved.schemaFile)) return 'present'
  try {
    await migrateAndCodegen(resolved, { scratch: true })
    if (existsSync(resolved.schemaFile)) return 'generated'
  } catch {}
  mkdirSync(dirname(resolved.schemaFile), { recursive: true })
  writeFileSync(resolved.schemaFile, 'export interface DB {}\n', 'utf8')
  return 'stubbed'
}
