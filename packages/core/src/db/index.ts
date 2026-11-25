/**
 * The plain declaration of an app's tables: data, not code.
 *
 * Nothing here knows about a database engine. A declaration says what a column
 * holds and how it relates to others; turning that into DDL for sqlite,
 * postgres or MySQL is the compiler's job (`compileTables` in `@pikku/addon-kysely`),
 * so the same object can be serialised for the console or an agent, and read
 * back without running anything.
 *
 * Tables and columns are named the way queries name them (camelCase); the
 * compiler turns them into physical snake_case names. Raw SQL fragments — a
 * `default: { sql }`, an `onUpdate: { sql }` or an index `where` — are written
 * once per engine and passed through verbatim, so they are in physical names.
 */

/**
 * What a column says about itself beyond its shape: how private it is, how it
 * is held at rest, and how it is typed. Carried on the column declaration, so
 * one place gives a table's shape and its classification.
 */
export interface ColumnAnnotation {
  /** Privacy level: can the value leave the process? Defaults to `private`. */
  security?: 'public' | 'private' | 'pii' | 'secret'
  /** How the value is held at rest, independent of `security`. Defaults to `plain`. */
  form?: 'plain' | 'hashed' | 'wrapped' | 'sealed'
  /** Which key protects a `wrapped` or `sealed` column. */
  keyId?: string
  /** Anonymize strategy. */
  classification?: 'fake:email' | 'fake:name' | 'hash' | 'keep'
  /**
   * Column kind, for coercion and typing. `bigint` reads a 64-bit integer as a
   * JS `number` and throws above `Number.MAX_SAFE_INTEGER`; a column typed
   * `bigint` has it already.
   */
  kind?: 'date' | 'bool' | 'json' | 'uuid' | 'bigint'
  /** TypeScript type override, e.g. `string[]`. Wins over `kind`. */
  tsType?: string
  /** Zod string format, e.g. `email`. Keeps the TypeScript type as `string`. */
  format?: string
  /** What the column holds, for people and agents reading the schema. */
  description?: string
  /**
   * `false` marks a column the server sets, through its default, `onUpdate` or
   * its own code: the generated zod input schemas leave it out, and the Kysely
   * types accept no insert or update of it.
   */
  input?: false
}

/**
 * What a column's value may be, beyond its type. The database enforces `enum`,
 * `min`, `max`, `minLength` and `maxLength` as named `CHECK` constraints
 * (`<table>_<column>_<kind>_check`); `pattern` is checked in the generated Zod
 * schema only, because engines disagree on regular expression syntax.
 *
 * Constraints go in when a table or column is created. Adding or changing one
 * on a column that already exists is refused by `pikku db generate`: a person
 * writes that migration, because existing rows may break it.
 */
export interface ColumnConstraints {
  /** The values the column may hold. */
  enum?: readonly string[]
  /** Smallest numeric value. */
  min?: number
  /** Largest numeric value. */
  max?: number
  /** Shortest string length. */
  minLength?: number
  /** Longest string length. */
  maxLength?: number
  /** A regular expression a string value must match. Zod only, never SQL. */
  pattern?: string
}

/** Annotations and constraints keyed by table, then column, spelled the way the statements spell them. */
export type TableAnnotations = Record<
  string,
  Record<string, ColumnAnnotation & ColumnConstraints>
>

/**
 * A column's type, in engine-neutral words.
 *
 * - `id` / `key`: an identifier or other text that takes part in a key.
 * - `text`: free text of any length.
 * - `string(n)`: text bounded to `n` characters.
 * - `timestamp`: a timestamp without a time zone.
 * - `timestamptz`: a timestamp with a time zone on postgres; a plain
 *   timestamp elsewhere, where there is no such type.
 * - `integer`: a 32-bit integer, read as a `number`.
 * - `bigint`: a 64-bit integer, still read as a `number`. A value above
 *   `Number.MAX_SAFE_INTEGER` throws on read instead of rounding.
 */
export type ColumnType =
  | 'id'
  | 'key'
  | 'text'
  | `string(${number})`
  | 'integer'
  | 'bigint'
  | 'real'
  | 'boolean'
  | 'timestamp'
  | 'timestamptz'
  | 'uuid'
  | 'json'

/**
 * What happens to a row when the row its foreign key points at is deleted.
 * The default is `restrict`: deleting a referenced row fails until whatever
 * points at it is dealt with.
 */
export type OnDelete = 'cascade' | 'setNull' | 'restrict' | 'noAction'

/** The engines a declaration compiles for. `sqlite` covers libSQL and Turso. */
export type DbEngine = 'postgres' | 'mysql' | 'sqlite'

/**
 * SQL written once per engine. Only the key for the project's configured
 * engine (`db.engine`) is required; a missing one is an error naming the column
 * and the engine, and an unknown key is an error too. Written in physical names.
 */
export type EngineSql = { [engine in DbEngine]?: string }

/**
 * A column default.
 *
 * A string, number or boolean is a literal. `{ now: true }` is the current
 * timestamp and `{ uuid: true }` a random version 4 UUID, each spelled the way
 * the engine spells it. `{ sql }` is a raw SQL expression per engine, the escape
 * hatch for anything else.
 */
export type ColumnDefault =
  | string
  | number
  | boolean
  | { now: true }
  | { uuid: true }
  | { sql: EngineSql }

/**
 * What a column is set to when an `UPDATE` does not set it itself.
 *
 * The same forms as a default, minus `uuid`. Postgres and SQLite get a trigger;
 * MySQL gets `ON UPDATE CURRENT_TIMESTAMP`, which only `{ now: true }` can use.
 * A value the statement sets explicitly always wins.
 */
export type ColumnOnUpdate =
  string | number | boolean | { now: true } | { sql: EngineSql }

/** The parts of a column declaration that do not depend on its type. */
export interface ColumnFields extends ColumnAnnotation, ColumnConstraints {
  /** `not null`. Primary key columns are required whether or not this says so. */
  required?: boolean
  default?: ColumnDefault
  /** Set when an `UPDATE` leaves the column alone. */
  onUpdate?: ColumnOnUpdate
  /** A single-column primary key. A composite key goes on the table. */
  primaryKey?: boolean
  /** A single-column unique constraint. A composite one goes on the table. */
  unique?: boolean
  /** A single-column, non-unique index. */
  index?: boolean
  /**
   * The column this one points at, as `table.column`. Without a `type`, the
   * column takes the type of its target.
   */
  references?: string
  /** Only meaningful with `references`. Defaults to `restrict`. */
  onDelete?: OnDelete
  /**
   * The name this column had in the migrations, so `pikku db generate` writes
   * `RENAME COLUMN` and the rows stay, instead of dropping the old column and
   * adding an empty one. Delete it once the migration is applied. Refused on a
   * column that is part of a key or an index, which a person renames by hand.
   */
  renamedFrom?: string
}

/**
 * One column. A `type` is required unless the column `references` another,
 * in which case it inherits the type of the column it points at.
 */
export type ColumnDeclaration = ColumnFields &
  ({ type: ColumnType } | { type?: ColumnType; references: string })

/**
 * One column of a `declareOnly` table. The type is read from the column the
 * migrations create, so declaring one is optional; a declared `type`, `tsType`
 * or `kind` that disagrees with that column is an error.
 *
 * Left undeclared, a 64-bit integer or a decimal reads as a `string` on
 * postgres, and binary data as a `Uint8Array`.
 */
export type DeclareOnlyColumnDeclaration = ColumnFields & {
  type?: ColumnType
}

/** An index over one or more columns. */
export interface IndexDeclaration {
  columns: readonly string[]
  unique?: boolean
  /**
   * A raw SQL predicate per engine making this a partial index, in physical
   * names. Supported on postgres and sqlite; MySQL has no partial indexes and
   * refuses.
   */
  where?: EngineSql
  /** Defaults to `<table>_<columns>_idx`. */
  name?: string
}

/**
 * A table-level constraint that keeps a name it already has in a deployed
 * database, so declaring it does not rename it.
 */
export interface NamedConstraint {
  columns: readonly string[]
  name: string
}

/** The parts of a table declaration that do not depend on who creates it. */
interface TableFields {
  /**
   * A composite primary key, instead of `primaryKey` on a column. Named
   * `<table>_pk` unless given a name.
   */
  primaryKey?: readonly string[] | NamedConstraint
  /**
   * Composite unique constraints, one list of columns each. Named
   * `<table>_<columns>_key` unless given a name.
   */
  unique?: readonly (readonly string[] | NamedConstraint)[]
  indexes?: readonly IndexDeclaration[]
}

/** A table `pikku db generate` writes SQL for. */
export interface ManagedTableDeclaration extends TableFields {
  columns: Record<string, ColumnDeclaration>
  declareOnly?: false
  /**
   * The name this table had in the migrations, so `pikku db generate` writes
   * `ALTER TABLE ... RENAME TO ...` and the rows stay, instead of creating the
   * new table and dropping the old one. The indexes, constraints and triggers
   * the engine names after the table are renamed with it, and a foreign key in
   * another table that points at it follows the new name. Delete it once the
   * migration is applied. Refused when the old table does not exist, when both
   * exist, and when another table is renamed from the same name.
   */
  renamedFrom?: string
}

/**
 * The table is created by something else — a hand-written migration, or
 * another package such as Better Auth — and declared here only for its types
 * and annotations. No SQL is generated for it; its columns are checked
 * against the table the migrations create.
 */
export interface DeclareOnlyTableDeclaration extends TableFields {
  columns: Record<string, DeclareOnlyColumnDeclaration>
  declareOnly: true
}

/** One table. */
export type TableDeclaration =
  ManagedTableDeclaration | DeclareOnlyTableDeclaration

/** An app's tables, keyed by table name. */
export type TablesDeclaration = Record<string, TableDeclaration>

/**
 * Declare an app's tables. Returns the declaration unchanged; it exists so the
 * object is checked against the vocabulary where it is written.
 */
export const defineTables = <const T extends TablesDeclaration>(tables: T): T =>
  tables
