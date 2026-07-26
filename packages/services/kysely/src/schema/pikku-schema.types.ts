import type { CompiledQuery, Kysely, RawBuilder } from 'kysely'

/**
 * One DDL statement, bound to a database.
 *
 * Bound rather than free-standing because the same declaration serves two
 * purposes that need the same object: applied to a throwaway database it yields
 * the schema to introspect, and compiled against a dialect it yields the SQL a
 * migration is written from.
 */
export interface SchemaStatement {
  execute(): Promise<unknown>
  compile(): CompiledQuery
}

export type SchemaStatementFactory = (db: Kysely<any>) => SchemaStatement

/**
 * The tables one part of the pikku runtime needs, declared rather than created.
 *
 * `name` labels the generated migration and the drift report, so it is part of
 * the contract — changing it orphans the migration that was written under the
 * old one.
 */
export interface PikkuSchema {
  name: string
  statements: SchemaStatementFactory[]
}

/**
 * Wrap a raw SQL fragment as a statement.
 *
 * For the DDL kysely's schema builder cannot express — a unique index over an
 * expression, say. Note that raw SQL is *not* rewritten by `withSchema`, so a
 * fragment naming a table unqualified will resolve against the connection's
 * search path rather than the schema the rest of the declaration lands in.
 */
export const rawStatement =
  (fragment: RawBuilder<unknown>): SchemaStatementFactory =>
  (db) => ({
    execute: () => fragment.execute(db),
    compile: () => fragment.compile(db),
  })
