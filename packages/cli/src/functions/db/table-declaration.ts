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

const snakeCase = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

/** A loaded `db/tables.ts`. */
export interface LoadedDeclaration {
  /** The tables `pikku db generate` writes SQL for. */
  schema: PikkuSchema
  /** The `declareOnly` tables: described here, created by something else. */
  declareOnly: TablesDeclaration
  /** Every column's annotations, keyed by physical table, then column. */
  annotations: TableAnnotations
}

const ALLOWED_VALUES: Record<
  keyof ColumnAnnotation,
  readonly string[] | 'string'
> = {
  security: ['public', 'private', 'pii', 'secret'],
  form: ['plain', 'hashed', 'wrapped', 'sealed'],
  classification: ['fake:email', 'fake:name', 'hash', 'keep'],
  kind: ['date', 'bool', 'json', 'uuid'],
  format: Object.keys(ZOD_FORMATS),
  keyId: 'string',
  tsType: 'string',
  description: 'string',
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
  'primaryKey',
  'unique',
  'index',
  'references',
  'onDelete',
])

const TABLE_FIELDS = new Set([
  'columns',
  'primaryKey',
  'unique',
  'indexes',
  'declareOnly',
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * What a column says about itself beyond its shape: its annotations and its
 * constraints, which is what the codegen and the console read from the sidecar.
 */
const annotationOf = (
  column: Record<string, unknown>
): ColumnAnnotation & ColumnConstraints =>
  Object.fromEntries(
    Object.entries(column).filter(
      ([field, value]) =>
        (field in ALLOWED_VALUES || CONSTRAINT_FIELDS.has(field)) &&
        value !== undefined
    )
  ) as ColumnAnnotation & ColumnConstraints

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

  const problems: string[] = []
  const annotations: TableAnnotations = {}
  const managed: TablesDeclaration = {}
  const declareOnly: TablesDeclaration = {}
  for (const [table, declaration] of Object.entries(exported)) {
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
    const target = declaration.declareOnly === true ? declareOnly : managed
    target[table] = declaration as unknown as TablesDeclaration[string]
  }
  if (problems.length > 0) {
    throw new Error(`${TABLES_FILE}: ${problems.join('; ')}.`)
  }

  try {
    // Checks the whole declaration, references between both kinds included.
    compileTables({ ...managed, ...declareOnly })
  } catch (error: any) {
    throw new Error(`${TABLES_FILE}: ${error.message}`)
  }

  return {
    schema: { name: APP_TABLES_SOURCE, tables: managed },
    declareOnly,
    annotations,
  }
}

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

/** Case folds only outside a string literal: `'A'` and `'a'` are different defaults. */
const sameDefault = (a: string | null, b: string | null): boolean => {
  if (a === null || b === null) return a === b
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

/**
 * Why a declared table cannot be brought into line by adding to it, if it can't.
 *
 * Everything here is either destructive or a guess. Dropping loses data; a
 * column that is gone beside one that appeared may be a rename or two unrelated
 * edits, and the wrong call loses data as well; changing a type or a constraint
 * can fail on existing rows, or rewrite them. Nothing here can tell, so these go
 * back to a person. `migrationsDir` is named because this is the one moment the
 * command hands the decision back, and that person needs to know where to act.
 */
export function refuseTableChanges(
  table: string,
  desired: Map<string, ColumnInfo>,
  actual: Map<string, ColumnInfo>,
  migrationsDir: string,
  rootDir: string
): string[] {
  const refusals: string[] = []
  const where = relative(rootDir, migrationsDir)
  const added = [...desired.keys()].filter((c) => !actual.has(c))
  const gone = [...actual.keys()].filter((c) => !desired.has(c))

  for (const column of gone) {
    const rename =
      added.length > 0
        ? ` It may be a rename to ${added.join(' or ')}, which generate cannot tell from a drop and an add.`
        : ''
    refusals.push(
      `${table}.${column} is in the migrations but not in ${TABLES_FILE}.${rename} ` +
        `generate never drops or renames. Put the column back, or, if the data really is ` +
        `to go or move, a person writes that migration in ${where} and generate will then agree with it.`
    )
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
            `${table} already has. Give it a default in ${TABLES_FILE}, or make it nullable.`
        )
      }
      continue
    }
    const changes = columnChanges(column, existing)
    if (changes.length > 0) {
      refusals.push(
        `${table}.${name} differs from the migrations: ${changes.join('; ')}. generate only adds. ` +
          `Change ${TABLES_FILE} to match, or a person writes that change in ${where}.`
      )
    }
  }
  return refusals
}

type TypeFamily =
  'text' | 'integer' | 'real' | 'boolean' | 'timestamp' | 'uuid' | 'json'

/** What an introspected type holds, or `undefined` when it is not one this can judge. */
const familyOf = (type: string): TypeFamily | undefined => {
  const t = type.toLowerCase()
  if (/bool/.test(t)) return 'boolean'
  if (/uuid/.test(t)) return 'uuid'
  if (/json/.test(t)) return 'json'
  if (/int/.test(t)) return 'integer'
  if (/real|double|float|numeric|decimal/.test(t)) return 'real'
  if (/timestamp|datetime|date|time/.test(t)) return 'timestamp'
  if (/char|text|clob|user-defined/.test(t)) return 'text'
  return undefined
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
      return ['text', 'uuid', 'integer']
    case 'key':
      return ['text', 'uuid']
    case 'integer':
    case 'bigint':
      return ['integer']
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
}

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
      const family = familyOf(typeOf(info))
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
      }
    }
  }
  return problems
}
