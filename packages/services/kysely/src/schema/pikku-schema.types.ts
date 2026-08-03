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
  types: RequiredTypes,
  ctx: SchemaContext
) => SchemaStatement

/**
 * What a statement needs to know about the schema its DDL lands in.
 *
 * Only raw SQL needs this. The schema builder learns the schema from the
 * connection — `withSchema('app')` qualifies every table it names, foreign key
 * targets included — but a raw fragment is passed through verbatim, so a
 * statement that spells its own SQL has to spell the qualifier too.
 */
export interface SchemaContext {
  /**
   * A table as the surrounding DDL addresses it: `"app"."credentials"` on a
   * schema-bound connection, `"credentials"` otherwise.
   *
   * Takes the physical name, not the camelCase one the schema builder accepts.
   * Raw SQL does not go through `CamelCasePlugin`, so it is already written in
   * physical names throughout and this is no exception.
   */
  table: (name: string) => RawBuilder<unknown>
}

/**
 * The `SchemaContext` for DDL that names no schema.
 *
 * The default everywhere a schema has not been asked for, which is every engine
 * but postgres and most postgres projects too.
 */
export const unqualifiedContext: SchemaContext = {
  table: (name) => sql.raw(`"${name}"`),
}

/**
 * A `SchemaContext` qualifying every table into `schema`.
 *
 * Identifiers are quoted rather than interpolated bare so a schema named after
 * a reserved word still compiles.
 */
export const schemaContext = (schema: string | undefined): SchemaContext =>
  schema
    ? { table: (name) => sql.raw(`"${schema}"."${name}"`) }
    : unqualifiedContext

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
 * expression, say. Raw SQL is *not* rewritten by `withSchema`, so a fragment
 * naming a table unqualified resolves against the connection's search path
 * rather than the schema the rest of the declaration lands in. Take the
 * function form and name tables through `ctx.table` to stay with them; the
 * bare-fragment form is for SQL that names no table at all.
 */
export function rawStatement(
  fragment: RawBuilder<unknown>
): SchemaStatementFactory
export function rawStatement(
  build: (ctx: SchemaContext) => RawBuilder<unknown>
): SchemaStatementFactory
export function rawStatement(
  source: RawBuilder<unknown> | ((ctx: SchemaContext) => RawBuilder<unknown>)
): SchemaStatementFactory {
  return (db, _types, ctx = unqualifiedContext) => {
    const fragment = typeof source === 'function' ? source(ctx) : source
    return {
      execute: () => fragment.execute(db),
      compile: () => fragment.compile(db),
    }
  }
}
