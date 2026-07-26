import { sql, type CompiledQuery, type Kysely, type RawBuilder } from 'kysely'

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

export type SchemaStatementFactory = (
  db: Kysely<any>,
  types: RequiredTypes
) => SchemaStatement

/**
 * The physical types of the columns named in `requires`, keyed `table.column`.
 *
 * Introspected from the database the schemas are being applied to, because a
 * foreign key column has to be declared with the type of the column it points
 * at and that column belongs to somebody else.
 */
export type RequiredTypes = Record<string, string>

/**
 * The declared type for a foreign key onto a column another source owns.
 *
 * Falls back to `text` when nothing has been introspected — the case when the
 * declaration is compiled without a database, where the real type is unknowable
 * and only the shape of the statement is being inspected.
 */
export const requiredType = (
  types: RequiredTypes,
  table: string,
  column: string
): RawBuilder<unknown> => sql.raw(types[`${table}.${column}`] ?? 'text')

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
  /**
   * Tables this schema references but does not create, which something else
   * must have created first.
   *
   * Declared rather than discovered so the failure arrives as a sentence naming
   * what is missing and who owns it, instead of a foreign key error from the
   * database — or, worse, a stub table conjured up to make the error go away.
   */
  requires?: SchemaRequirement[]
}

/**
 * A column another source owns, which one of these schemas depends on.
 *
 * Named down to the column, not just the table, because that is the granularity
 * the dependency actually has: a foreign key needs the referenced column to
 * exist *and* needs its type in order to declare a matching one.
 *
 * `owner` is carried in the declaration rather than composed into the error at
 * the point it is thrown, so adding a second prerequisite cannot leave behind a
 * message that still names the first one's owner.
 */
export interface SchemaRequirement {
  table: string
  column: string
  owner: string
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
