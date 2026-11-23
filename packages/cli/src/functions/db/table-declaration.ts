import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type {
  ColumnAnnotation,
  ColumnConstraints,
  ColumnType,
  TableAnnotations,
  TablesDeclaration,
} from '@pikku/core/db'
import { compileTables, type PikkuSchema } from '@pikku/kysely'
import { loadFreshUserModule } from '../commands/load-user-project.js'
import type { ColumnInfo } from './db-introspector.js'
import { APP_TABLES_SOURCE } from './migration-provenance.js'
import { ZOD_FORMATS } from './zod-codegen.js'
import { snakeCase } from './snake-case.js'
import { typeFamilyOf, type TypeFamily } from './column-family.js'

/** Where a project declares its own tables, relative to its root. */
export const TABLES_FILE = 'db/tables.ts'

/**
 * Where column annotations used to live, relative to a project's root. Nothing
 * reads it any more; a project that still has one is told where they went.
 */
export const RETIRED_ANNOTATIONS_FILE = 'db/annotations.ts'

/** Said wherever a project still has {@link RETIRED_ANNOTATIONS_FILE}. */
export const retiredAnnotationsMessage = `${RETIRED_ANNOTATIONS_FILE} is no longer read: move each entry onto its column in db/tables.ts (a table your migrations create is declared \`declareOnly: true\`) and delete the file, as docs/MIGRATION.md shows.`

/** The export of {@link TABLES_FILE} that holds the declaration. */
const TABLES_EXPORT = 'tables'

/** A loaded `db/tables.ts`. */
export interface LoadedDeclaration {
  /** The tables `pikku db generate` writes SQL for. */
  schema: PikkuSchema
  /** The `declareOnly` tables: described here, created by something else. */
  declareOnly: TablesDeclaration
  /** Every column's annotations, keyed by physical table, then column. */
  annotations: TableAnnotations
  /** The columns declared with `renamedFrom`, in physical names. */
  renames: ColumnRename[]
  /** The tables declared with `renamedFrom`, in physical names. */
  renamedTables: TableRename[]
  /** Who declared each table (physical name), when it was not `db/tables.ts`: what messages name. */
  owners?: Record<string, string>
}

/** A column that is the old one under a new name. */
export interface ColumnRename {
  table: string
  from: string
  to: string
}

/** A table that is the old one under a new name. */
export interface TableRename {
  from: string
  to: string
}

const ALLOWED_VALUES: Record<
  keyof ColumnAnnotation,
  readonly string[] | 'string' | 'false'
> = {
  security: ['public', 'private', 'pii', 'secret'],
  form: ['plain', 'hashed', 'wrapped', 'sealed'],
  classification: ['fake:email', 'fake:name', 'hash', 'keep'],
  kind: ['date', 'bool', 'json', 'uuid', 'bigint'],
  format: Object.keys(ZOD_FORMATS),
  keyId: 'string',
  tsType: 'string',
  description: 'string',
  input: 'false',
}

/** The constraint fields of a column, which the sidecar carries beside its annotations. */
const CONSTRAINT_FIELDS = new Set<string>([
  'enum',
  'min',
  'max',
  'minLength',
  'maxLength',
  'pattern',
])

/** The column fields that are not annotations. */
const COLUMN_FIELDS = new Set([
  ...CONSTRAINT_FIELDS,
  'type',
  'required',
  'default',
  'onUpdate',
  'primaryKey',
  'unique',
  'index',
  'references',
  'onDelete',
  'renamedFrom',
])

const TABLE_FIELDS = new Set([
  'columns',
  'primaryKey',
  'unique',
  'indexes',
  'declareOnly',
  'renamedFrom',
])

/**
 * Check one column's annotations and return what is wrong with them.
 *
 * Dropping an unknown value would mean a typo in `security: 'pi'` leaves a
 * column with personal data at the default level with nothing said, so every
 * field is checked, and a field that is neither an annotation nor part of the
 * column's shape is refused.
 */
function columnProblems(at: string, column: Record<string, unknown>): string[] {
  const problems: string[] = []
  for (const [field, value] of Object.entries(column)) {
    if (COLUMN_FIELDS.has(field)) continue
    const allowed = ALLOWED_VALUES[field as keyof ColumnAnnotation]
    if (!allowed) {
      problems.push(`${at} has an unknown field '${field}'`)
    } else if (allowed === 'false') {
      if (value !== false) problems.push(`${at}.input must be false`)
    } else if (allowed === 'string') {
      if (typeof value !== 'string') {
        problems.push(`${at}.${field} must be a string`)
      }
    } else if (!allowed.includes(value as string)) {
      problems.push(
        `${at}.${field} is '${String(value)}', which is not one of ${allowed.join(', ')}`
      )
    }
  }
  return problems
}

/**
 * What `renamedFrom` on the columns of one table asks for, and what is wrong
 * with it. A rename keeps the column's rows and nothing else, so it is refused
 * wherever the old name could still be in play: another column that has that
 * name, a second column renamed from it, and a column that a key or an index
 * names, because the key or index would keep its old name.
 */
export function tableRenames(
  table: string,
  declaration: {
    columns: Record<string, Record<string, unknown>>
    primaryKey?: unknown
    unique?: unknown
    indexes?: unknown
  }
): { renames: ColumnRename[]; problems: string[] } {
  const renames: ColumnRename[] = []
  const problems: string[] = []
  const named = new Set(Object.keys(declaration.columns).map(snakeCase))
  const inKeys = new Set(
    [
      declaration.primaryKey,
      ...(Array.isArray(declaration.unique) ? declaration.unique : []),
      ...(Array.isArray(declaration.indexes) ? declaration.indexes : []),
    ].flatMap((key) => {
      const columns = Array.isArray(key)
        ? key
        : isObject(key) && Array.isArray(key.columns)
          ? key.columns
          : []
      return columns.map((c) => snakeCase(String(c)))
    })
  )
  for (const [column, entry] of Object.entries(declaration.columns)) {
    if (entry.renamedFrom === undefined) continue
    const at = `${table}.${column}`
    const to = snakeCase(column)
    if (typeof entry.renamedFrom !== 'string' || !entry.renamedFrom) {
      problems.push(`${at}.renamedFrom must be the column's old name`)
      continue
    }
    const from = snakeCase(entry.renamedFrom)
    if (from === to) {
      problems.push(`${at}.renamedFrom is the column's own name`)
    } else if (named.has(from)) {
      problems.push(
        `${at}.renamedFrom is '${entry.renamedFrom}', but ${table} still declares a column of that name`
      )
    } else if (renames.some((r) => r.from === from)) {
      problems.push(
        `${table} renames '${entry.renamedFrom}' to two columns; a column can only be renamed once`
      )
    } else if (
      entry.primaryKey ||
      entry.unique ||
      entry.index ||
      entry.references ||
      inKeys.has(to)
    ) {
      problems.push(
        `${at}.renamedFrom is refused on a column that is part of a key, an index or a reference: ` +
          `their names would keep the old one. A person writes that rename in a migration.`
      )
    } else {
      renames.push({ table: snakeCase(table), from, to })
    }
  }
  return { renames, problems }
}

/**
 * Read the `renamedFrom` of each table (keyed by declared name) into physical
 * renames, adding what is wrong with them to `problems`. A table is refused when
 * its old name is not a name, is its own, is still declared, or is the old name
 * of another table too.
 */
function tableRenameProblems(
  asked: Record<string, unknown>,
  declared: string[],
  problems: string[]
): TableRename[] {
  const renames: TableRename[] = []
  const names = new Set(declared.map(snakeCase))
  const claimedBy = new Map<string, string>()
  for (const [table, value] of Object.entries(asked)) {
    if (typeof value !== 'string' || !value) {
      problems.push(`${table}.renamedFrom must be the table's old name`)
      continue
    }
    const from = snakeCase(value)
    const to = snakeCase(table)
    const other = claimedBy.get(from)
    const badName = identifierProblem(`${table}.renamedFrom`, value)
    if (badName) {
      problems.push(badName)
    } else if (from === to) {
      problems.push(`${table}.renamedFrom is the table's own name`)
    } else if (names.has(from)) {
      problems.push(
        `${table}.renamedFrom is '${value}', but the declaration still has a table of that name`
      )
    } else if (other) {
      problems.push(
        `${other} and ${table} are both renamed from '${value}'; a table can only be renamed once`
      )
    } else {
      claimedBy.set(from, table)
      renames.push({ from, to })
    }
  }
  return renames
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * What a column says about itself beyond its shape: its annotations and its
 * constraints, which is what the codegen and the console read from the sidecar.
 */
export const annotationOf = (
  column: Record<string, unknown>
): ColumnAnnotation & ColumnConstraints => {
  const annotation = Object.fromEntries(
    Object.entries(column).filter(
      ([field, value]) =>
        (field in ALLOWED_VALUES || CONSTRAINT_FIELDS.has(field)) &&
        value !== undefined
    )
  ) as ColumnAnnotation & ColumnConstraints
  return column.type === 'bigint' && annotation.kind === undefined
    ? { ...annotation, kind: 'bigint' }
    : annotation
}

/**
 * Read `db/tables.ts`, or `null` when the project declares nothing. A
 * project that still has `db/annotations.ts` is refused, because those
 * annotations would otherwise be dropped without a word.
 *
 * The file's presence is the opt-in, so its absence changes nothing for a
 * project on hand-written migrations. A file that is present and cannot be read
 * is the opposite case and stops the command: carrying on would treat every
 * table it declares, and every classification on them, as if it were not there.
 */
export async function loadTableDeclaration(
  rootDir: string
): Promise<LoadedDeclaration | null> {
  if (existsSync(join(rootDir, RETIRED_ANNOTATIONS_FILE))) {
    throw new Error(retiredAnnotationsMessage)
  }
  const file = join(rootDir, TABLES_FILE)
  if (!existsSync(file)) return null

  let exported: unknown
  try {
    exported = (await loadFreshUserModule(file))[TABLES_EXPORT]
  } catch (error: any) {
    throw new Error(`${TABLES_FILE} could not be loaded: ${error.message}`)
  }

  if (isObject(exported) && Array.isArray(exported.statements)) {
    throw new Error(
      `${TABLES_FILE} exports the old \`defineTables({ statements })\` shape, which is gone: declare each table as \`{ columns }\` with \`defineTables\` from @pikku/core/db, as docs/MIGRATION.md shows.`
    )
  }
  if (!isObject(exported)) {
    throw new Error(
      `${TABLES_FILE} must export \`const ${TABLES_EXPORT} = defineTables({ ... })\`, with \`defineTables\` from @pikku/core/db.`
    )
  }

  return parseDeclaration(exported, TABLES_FILE)
}

/**
 * Check a declaration that is already in hand and read it into the form the
 * planner works from. Pure: `db/tables.ts` and an addon's published JSON both go
 * through it, so a declaration means the same thing wherever it came from.
 * `label` names the source in every message.
 */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * A name that reaches SQL, the `-- pikku:tables` marker and object keys. A comma
 * there would forge ownership of another table, so anything but a plain
 * identifier is refused rather than quoted or dropped.
 */
const identifierProblem = (what: string, name: string): string | null =>
  IDENTIFIER.test(name) && !FORBIDDEN_KEYS.has(name)
    ? null
    : `${what} ${JSON.stringify(name)} is not a plain identifier: use letters, digits and underscores, not starting with a digit, at most 63 characters`

export function parseDeclaration(
  exported: Record<string, unknown>,
  label: string
): LoadedDeclaration {
  const problems: string[] = []
  const annotations: TableAnnotations = {}
  const managed: TablesDeclaration = {}
  const renames: ColumnRename[] = []
  const declareOnly: TablesDeclaration = {}
  const renamedFrom: Record<string, unknown> = {}
  for (const [table, declaration] of Object.entries(exported)) {
    const badTable = identifierProblem('table', table)
    if (badTable) {
      problems.push(badTable)
      continue
    }
    if (!isObject(declaration) || !isObject(declaration.columns)) {
      problems.push(`${table} must be an object with its columns`)
      continue
    }
    for (const field of Object.keys(declaration)) {
      if (!TABLE_FIELDS.has(field)) {
        problems.push(`${table} has an unknown field '${field}'`)
      }
    }
    const physical: TableAnnotations[string] = {}
    for (const [column, entry] of Object.entries(declaration.columns)) {
      const badColumn = identifierProblem(`${table} column`, column)
      if (badColumn) {
        problems.push(badColumn)
        continue
      }
      if (!isObject(entry)) {
        problems.push(`${table}.${column} must be an object`)
        continue
      }
      problems.push(...columnProblems(`${table}.${column}`, entry))
      const annotation = annotationOf(entry)
      if (Object.keys(annotation).length > 0) {
        physical[snakeCase(column)] = annotation
      }
    }
    if (Object.keys(physical).length > 0) {
      annotations[snakeCase(table)] = physical
    }
    if (
      declaration.declareOnly !== undefined &&
      typeof declaration.declareOnly !== 'boolean'
    ) {
      problems.push(
        `${table} has declareOnly ${JSON.stringify(declaration.declareOnly)}, which must be true or false`
      )
      continue
    }
    const target = declaration.declareOnly === true ? declareOnly : managed
    const asked = tableRenames(
      table,
      declaration as Parameters<typeof tableRenames>[1]
    )
    if (declaration.declareOnly === true) {
      if (asked.renames.length + asked.problems.length > 0) {
        problems.push(
          `${table} is declareOnly, so nothing generated renames its columns: renamedFrom has no effect there`
        )
      }
    } else {
      problems.push(...asked.problems)
      renames.push(...asked.renames)
    }
    target[table] = declaration as unknown as TablesDeclaration[string]
    if (declaration.renamedFrom !== undefined) {
      if (declaration.declareOnly === true) {
        problems.push(
          `${table} is declareOnly, so nothing generated renames it: renamedFrom has no effect there`
        )
      } else {
        renamedFrom[table] = declaration.renamedFrom
      }
    }
  }
  const renamedTables = tableRenameProblems(
    renamedFrom,
    Object.keys(exported),
    problems
  )
  if (problems.length > 0) {
    throw new Error(`${label}: ${problems.join('; ')}.`)
  }

  try {
    // Checks the whole declaration, references between both kinds included.
    compileTables({ ...managed, ...declareOnly })
  } catch (error: any) {
    throw new Error(`${label}: ${error.message}`)
  }

  return {
    schema: { name: APP_TABLES_SOURCE, tables: managed },
    declareOnly,
    annotations,
    renames,
    renamedTables,
  }
}

/** A declaration of nothing: what an app with no `db/tables.ts` declares of its own. */
export const emptyDeclaration = (): LoadedDeclaration => ({
  schema: { name: APP_TABLES_SOURCE, tables: {} },
  declareOnly: {},
  annotations: {},
  renames: [],
  renamedTables: [],
})

/** Every table a declaration names, managed or not, in physical names. */
export const declaredTableNames = (
  declaration: LoadedDeclaration
): { managed: string[]; declareOnly: string[] } => ({
  managed: Object.keys(declaration.schema.tables).map(snakeCase),
  declareOnly: Object.keys(declaration.declareOnly).map(snakeCase),
})

// ─── The record of what was declared ─────────────────────────────────────────

const TABLES_MARKER = '-- pikku:tables '

/** The header line recording which tables a generated migration declared. */
export const declaredTablesMarker = (tables: Iterable<string>): string =>
  `${TABLES_MARKER}${[...tables].join(', ')}`

/**
 * Every table a generated migration has recorded as declared.
 *
 * What tells "removed from the declaration" apart from "never in it". A table
 * in the migrations that the declaration does not name is an ordinary
 * hand-written table, unless a migration says otherwise, and the migrations are
 * what can say so: they are the one record that travels with the project.
 */
export function recordedDeclaredTables(migrationsDir: string): Set<string> {
  const recorded = new Set<string>()
  if (!existsSync(migrationsDir)) return recorded
  for (const file of readdirSync(migrationsDir)) {
    if (!file.endsWith('.sql')) continue
    for (const line of readFileSync(join(migrationsDir, file), 'utf8').split(
      '\n'
    )) {
      if (!line.startsWith(TABLES_MARKER)) continue
      for (const table of line.slice(TABLES_MARKER.length).split(',')) {
        if (table.trim()) recorded.add(table.trim())
      }
    }
  }
  return recorded
}

// ─── Comparing a declared table with what the migrations hold ────────────────

/** The current timestamp as each engine reports it: `now()` on postgres, `CURRENT_TIMESTAMP` elsewhere. */
const isNow = (value: string): boolean =>
  /^(now\(\)|current_timestamp(\(\))?)$/i.test(value.trim())

/** Case folds only outside a string literal: `'A'` and `'a'` are different defaults. */
const sameDefault = (a: string | null, b: string | null): boolean => {
  if (a === null || b === null) return a === b
  if (isNow(a) && isNow(b)) return true
  return /['"]/.test(a) || /['"]/.test(b)
    ? a.trim() === b.trim()
    : a.trim().toLowerCase() === b.trim().toLowerCase()
}

const typeOf = (column: ColumnInfo): string =>
  `${column.type} ${column.udtName ?? ''}`
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

/** The ways one existing column differs from its declaration. */
function columnChanges(desired: ColumnInfo, actual: ColumnInfo): string[] {
  const changes: string[] = []
  if (typeOf(desired) !== typeOf(actual)) {
    changes.push(
      `type is ${actual.type} in the migrations and ${desired.type} in the declaration`
    )
  }
  if (desired.pk !== actual.pk) {
    changes.push(
      desired.pk ? 'it became a primary key' : 'it stopped being a primary key'
    )
  }
  // Only sqlite lets a primary key be nullable on paper, and it says so
  // differently depending on how the key was spelled.
  if (desired.notNull !== actual.notNull && !(desired.pk && actual.pk)) {
    changes.push(
      desired.notNull ? 'it became NOT NULL' : 'it stopped being NOT NULL'
    )
  }
  if (!sameDefault(desired.defaultValue, actual.defaultValue)) {
    changes.push(
      `default is ${actual.defaultValue ?? 'none'} in the migrations and ${desired.defaultValue ?? 'none'} in the declaration`
    )
  }
  return changes
}

/** A change a migration makes that loses data or breaks what runs against it. */
export interface DestructiveChange {
  kind: 'dropColumn' | 'dropTable'
  table: string
  /** The column dropped. */
  column?: string
  /** What a person approves, one line: `DROP COLUMN note.legacy_flag: its data is lost`. */
  what: string
}

/**
 * What stops a declared table being brought into line by adding to it, and what
 * can be done with approval.
 *
 * A column that is gone loses its data when dropped, so it is returned as a
 * destructive change for a person to approve rather than refused outright; a
 * rename (see `renamedFrom`) was applied to `actual` by the caller before this
 * runs. Changing a type or a constraint can fail on existing rows, or rewrite
 * them, and nothing here can tell which, so those stay refusals.
 * `migrationsDir` is named because this is the one moment the command hands the
 * decision back, and that person needs to know where to act.
 */
export function refuseTableChanges(
  table: string,
  desired: Map<string, ColumnInfo>,
  actual: Map<string, ColumnInfo>,
  migrationsDir: string,
  rootDir: string,
  declaredIn: string = TABLES_FILE
): { refusals: string[]; destructive: DestructiveChange[] } {
  const refusals: string[] = []
  const destructive: DestructiveChange[] = []
  const where = relative(rootDir, migrationsDir)
  const added = [...desired.keys()].filter((c) => !actual.has(c))
  const gone = [...actual.keys()].filter((c) => !desired.has(c))

  for (const column of gone) {
    const moved =
      added.length > 0
        ? ` (if it moved to ${added.join(' or ')}, declare that column with renamedFrom: '${column}' instead)`
        : ''
    destructive.push({
      kind: 'dropColumn',
      table,
      column,
      what: `DROP COLUMN ${table}.${column}: its data is lost${moved}${declaredIn === TABLES_FILE ? '' : ` (declared by ${declaredIn})`}`,
    })
  }

  for (const [name, column] of desired) {
    const existing = actual.get(name)
    if (!existing) {
      if (column.pk) {
        refusals.push(
          `${table}.${name} is a new primary key on a table that already exists. That rewrites ` +
            `the table, so a person writes that migration in ${where}.`
        )
      } else if (column.notNull && column.defaultValue === null) {
        refusals.push(
          `${table}.${name} is new and NOT NULL with no default, so there is no value for the rows ` +
            `${table} already has. Give it a default in ${declaredIn}, or make it nullable.`
        )
      }
      continue
    }
    const changes = columnChanges(column, existing)
    if (changes.length > 0) {
      refusals.push(
        `${table}.${name} differs from the migrations: ${changes.join('; ')}. generate does not change ` +
          `an existing column's type or constraints. Change ${declaredIn} to match, or a person writes ` +
          `that change in ${where}.`
      )
    }
  }
  return { refusals, destructive }
}

/**
 * The families a declared type may be found as. Loose where an engine has no
 * such type and stores it as another: sqlite keeps dates as text or numbers,
 * MySQL a uuid as `char(36)`, and both a boolean as an integer.
 */
const acceptedFamilies = (type: ColumnType, dialect: string): TypeFamily[] => {
  const dates: TypeFamily[] =
    dialect === 'sqlite' ? ['timestamp', 'text', 'integer'] : ['timestamp']
  switch (type) {
    case 'id':
      return ['text', 'uuid', 'integer', 'bigint']
    case 'key':
      return ['text', 'uuid']
    case 'integer':
      return dialect === 'sqlite' ? ['integer', 'bigint'] : ['integer']
    case 'bigint':
      return dialect === 'sqlite' ? ['bigint', 'integer'] : ['bigint']
    case 'real':
      return ['real']
    case 'boolean':
      return ['boolean', 'integer']
    case 'timestamp':
    case 'timestamptz':
      return dates
    case 'uuid':
      return ['uuid', 'text']
    case 'json':
      return ['json', 'text']
    default:
      return ['text']
  }
}

const KIND_FAMILIES: Record<
  NonNullable<ColumnAnnotation['kind']>,
  (dialect: string) => TypeFamily[]
> = {
  date: (dialect) =>
    dialect === 'sqlite' ? ['timestamp', 'text', 'integer'] : ['timestamp'],
  bool: () => ['boolean', 'integer'],
  json: () => ['json', 'text'],
  uuid: () => ['uuid', 'text'],
  bigint: () => ['bigint', 'integer'],
}

/**
 * What a primitive `tsType` claims the column reads as, against what a column
 * of that family really reads as on this dialect. Only the primitives are
 * judged: any other `tsType` is a refinement (a union, a JSON shape) that the
 * family cannot contradict.
 */
const PRIMITIVE_READS: Record<
  string,
  (family: TypeFamily, dialect: string) => boolean
> = {
  number: (family, dialect) =>
    family === 'integer' ||
    family === 'real' ||
    (dialect !== 'postgres' && (family === 'bigint' || family === 'decimal')),
  string: (family, dialect) =>
    family === 'text' ||
    family === 'uuid' ||
    family === 'timestamp' ||
    (dialect !== 'sqlite' && family === 'decimal') ||
    (dialect === 'postgres' && family === 'bigint'),
  boolean: (family) => family === 'boolean',
  Uint8Array: (family) => family === 'bytea',
}

const readsAs = (family: TypeFamily, dialect: string): string =>
  (['number', 'string', 'boolean', 'Uint8Array'] as const).find((read) =>
    PRIMITIVE_READS[read]!(family, dialect)
  ) ?? family

/**
 * Where a `declareOnly` table disagrees with the table the migrations made.
 *
 * Nothing is generated for these, so nothing else would notice: a column that
 * is not there, or holds something other than what the declaration types it as,
 * would only surface as a wrong type in the generated schema.
 */
export function declareOnlyProblems(
  declareOnly: TablesDeclaration,
  existing: (table: string) => Map<string, ColumnInfo> | undefined,
  dialect: string
): string[] {
  const problems: string[] = []
  for (const [logical, declaration] of Object.entries(declareOnly)) {
    const table = snakeCase(logical)
    const actual = existing(table)
    if (!actual) {
      problems.push(
        `${TABLES_FILE} declares ${table} as declareOnly, but no migration creates it. ` +
          'Something else has to create a declareOnly table; drop declareOnly to have generate write it.'
      )
      continue
    }
    for (const [name, column] of Object.entries(declaration.columns)) {
      const at = `${table}.${snakeCase(name)}`
      const info = actual.get(snakeCase(name))
      if (!info) {
        problems.push(
          `${TABLES_FILE} declares ${at}, which the migrations do not create.`
        )
        continue
      }
      const family = typeFamilyOf(typeOf(info))
      if (!family) continue
      if (
        column.type &&
        !acceptedFamilies(column.type, dialect).includes(family)
      ) {
        problems.push(
          `${at} is ${info.type} in the migrations, which does not hold the '${column.type}' ${TABLES_FILE} declares.`
        )
      } else if (
        column.kind &&
        !KIND_FAMILIES[column.kind](dialect).includes(family)
      ) {
        problems.push(
          `${at} is ${info.type} in the migrations, which does not hold the kind '${column.kind}' ${TABLES_FILE} gives it.`
        )
      } else if (
        column.tsType &&
        column.tsType in PRIMITIVE_READS &&
        !column.kind &&
        column.type !== 'bigint' &&
        !PRIMITIVE_READS[column.tsType]!(family, dialect)
      ) {
        const advice =
          column.tsType === 'number' && family === 'bigint'
            ? " Declare type: 'bigint' (or kind: 'bigint') to read it as a number, checked against the safe range."
            : ` Drop the tsType to read it as ${readsAs(family, dialect)}.`
        problems.push(
          `${at} is ${info.type} in the migrations, which reads as ${readsAs(family, dialect)}, not the '${column.tsType}' ${TABLES_FILE} gives it as tsType.${advice}`
        )
      }
    }
  }
  return problems
}

// ─── onUpdate on a table something else creates ──────────────────────────────

/** What keeps an `onUpdate` in the schema the migrations alone define. */
export interface UpdateRules {
  /** Triggers, with the table each is on and its definition as the database reports it. */
  triggers: { name: string; table: string; definition: string }[]
  /** MySQL columns carrying `ON UPDATE`, as `table.column`. */
  attributes: Set<string>
}

/** Whether any column of a `declareOnly` table declares an `onUpdate`. */
export const declaresOnUpdate = (declareOnly: TablesDeclaration): boolean =>
  Object.values(declareOnly).some((table) =>
    Object.values(table.columns).some((column) => column.onUpdate !== undefined)
  )

/**
 * Where a `declareOnly` column declares an `onUpdate` that nothing the
 * migrations create provides.
 *
 * Nothing is generated for these tables, so a declaration that promised the
 * column would be kept current would otherwise be believed and never true. The
 * author writes the migration: a trigger on Postgres and SQLite, the `ON UPDATE`
 * attribute on MySQL.
 */
export function declareOnlyOnUpdateProblems(
  declareOnly: TablesDeclaration,
  rules: UpdateRules,
  dialect: string
): string[] {
  const problems: string[] = []
  for (const [logical, declaration] of Object.entries(declareOnly)) {
    const table = snakeCase(logical)
    for (const [name, column] of Object.entries(declaration.columns)) {
      if (column.onUpdate === undefined) continue
      const physical = snakeCase(name)
      const at = `${table}.${physical}`
      const provided =
        dialect === 'mysql'
          ? rules.attributes.has(at)
          : rules.triggers.some(
              (trigger) =>
                trigger.table === table &&
                new RegExp(`\\b${physical}\\b`, 'i').test(trigger.definition) &&
                /\bupdate\b/i.test(trigger.definition)
            )
      if (!provided) {
        problems.push(
          `${TABLES_FILE} declares onUpdate on ${at}, but the migrations create no ` +
            `${dialect === 'mysql' ? 'ON UPDATE attribute' : 'UPDATE trigger'} for it. ` +
            `Nothing is generated for a declareOnly table, so write that migration, or drop the onUpdate.`
        )
      }
    }
  }
  return problems
}
