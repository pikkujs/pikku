import type { DatabaseSync } from 'node:sqlite'
import type { SqliteFunctionMap } from '@pikku/kysely-sqlite'

/**
 * Registers scalar user-defined SQL functions on a node:sqlite connection.
 *
 * Exported separately from `createNodeSqliteKysely` because an app that needs
 * pragmas — WAL, `foreign_keys`, `busy_timeout` — has to build the connection
 * itself, and would otherwise have no supported way to add UDFs to it.
 *
 * Registered as `deterministic`, which is what makes them usable in indexes and
 * lets SQLite cache repeated calls with the same arguments. That is a promise
 * about the function, not a hint: one whose output depends on the clock, a
 * random source or anything mutable must not go through here.
 *
 * There is no bun counterpart. `@pikku/kysely-bun-sqlite` exports the same name
 * so the import resolves either way, but it throws — see
 * SqliteFunctionsUnsupportedError.
 */
export function registerSqliteFunctions(
  db: DatabaseSync,
  functions: SqliteFunctionMap
): void {
  for (const [name, fn] of Object.entries(functions)) {
    db.function(name, { deterministic: true }, fn as never)
  }
}
