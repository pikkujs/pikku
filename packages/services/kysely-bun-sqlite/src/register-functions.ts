import type { Database } from 'bun:sqlite'
import {
  SqliteFunctionsUnsupportedError,
  type SqliteFunctionMap,
} from '@pikku/kysely-sqlite'

/**
 * The bun counterpart to `@pikku/kysely-node-sqlite`'s function of the same
 * name. It always throws: bun:sqlite exposes `loadExtension` but nothing
 * equivalent to node:sqlite's `db.function()`, so scalar UDFs cannot be
 * registered at all.
 *
 * It exists precisely so that the failure happens here. Without it the two
 * drivers differ silently — code written against node registers its functions,
 * the same code on bun does not, and the difference only surfaces as
 * `no such function: …` from whichever query calls one, which in practice means
 * one endpoint failing in production while the rest of the app looks healthy.
 *
 * Throwing at wiring time turns that into a startup error naming every function
 * involved.
 */
export function registerSqliteFunctions(
  _db: Database,
  functions: SqliteFunctionMap
): never {
  throw new SqliteFunctionsUnsupportedError(
    'bun:sqlite',
    Object.keys(functions)
  )
}
