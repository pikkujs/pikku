/**
 * The plain declaration of an app's tables: data, not code.
 *
 * Nothing here knows about a database engine. A declaration says what a column
 * holds and how it relates to others; turning that into DDL for sqlite,
 * postgres or MySQL is the compiler's job (`compileTables` in `@pikku/kysely`),
 * so the same object can be serialised for the console or an agent, and read
 * back without running anything.
 *
 * Tables and columns are named the way queries name them (camelCase); the
 * compiler turns them into physical snake_case names. Raw SQL fragments — a
 * `default: { sql }` or an index `where` — are passed through verbatim, so they
 * are written in physical names.
 */

/**
 * What `db/annotations.ts` says about one column: how private it is, how it is
 * held at rest, and how it is typed. Carried on the column declaration too, so
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
  /** Column kind, for coercion and typing. */
  kind?: 'date' | 'bool' | 'json' | 'uuid'
  /** TypeScript type override, e.g. `string[]`. Wins over `kind`. */
  tsType?: string
  /** Zod string format, e.g. `email`. Keeps the TypeScript type as `string`. */
  format?: string
  /** What the column holds, for people and agents reading the schema. */
  description?: string
}

/** Annotations keyed by table, then column, spelled the way the statements spell them. */
export type TableAnnotations = Record<string, Record<string, ColumnAnnotation>>

/**
 * A column's type, in engine-neutral words.
 *
 * - `id` / `key`: an identifier or other text that takes part in a key.
 * - `text`: free text of any length.
 * - `string(n)`: text bounded to `n` characters.
 * - `timestamp`: a timestamp without a time zone.
 * - `timestamptz`: a timestamp with a time zone on postgres; a plain
 *   timestamp elsewhere, where there is no such type.
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

/**
 * A column default.
 *
 * A string, number or boolean is a literal. `{ now: true }` is the current
 * timestamp. `{ sql }` is a raw SQL expression passed through verbatim, the
 * escape hatch for anything else (`gen_random_uuid()`, say).
 */
export type ColumnDefault =
  string | number | boolean | { now: true } | { sql: string }

/** The parts of a column declaration that do not depend on its type. */
export interface ColumnFields extends ColumnAnnotation {
  /** `not null`. Primary key columns are required whether or not this says so. */
  required?: boolean
  default?: ColumnDefault
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
  /** A regular expression a string value must match. */
  pattern?: string
}

/**
 * One column. A `type` is required unless the column `references` another,
 * in which case it inherits the type of the column it points at.
 */
export type ColumnDeclaration = ColumnFields &
  ({ type: ColumnType } | { type?: ColumnType; references: string })

/** An index over one or more columns. */
export interface IndexDeclaration {
  columns: readonly string[]
  unique?: boolean
  /**
   * A raw SQL predicate making this a partial index, in physical names.
   * Supported on postgres and sqlite; MySQL has no partial indexes and refuses.
   */
  where?: string
  /** Defaults to `<table>_<columns>_idx`. */
  name?: string
}

/** One table. */
export interface TableDeclaration {
  columns: Record<string, ColumnDeclaration>
  /** A composite primary key, instead of `primaryKey` on a column. */
  primaryKey?: readonly string[]
  /** Composite unique constraints, one list of columns each. */
  unique?: readonly (readonly string[])[]
  indexes?: readonly IndexDeclaration[]
}

/** An app's tables, keyed by table name. */
export type TablesDeclaration = Record<string, TableDeclaration>

/**
 * Declare an app's tables. Returns the declaration unchanged; it exists so the
 * object is checked against the vocabulary where it is written.
 */
export const defineTables = <const T extends TablesDeclaration>(tables: T): T =>
  tables
