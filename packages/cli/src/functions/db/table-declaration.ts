import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type {
  AppTables,
  ColumnAnnotation,
  PikkuSchema,
  TableAnnotations,
} from '@pikku/kysely'
import { loadFreshUserModule } from '../commands/load-user-project.js'
import { flattenAnnotationTables } from './annotation-parser.js'
import type { ColumnInfo } from './db-introspector.js'
import { APP_TABLES_SOURCE } from './migration-provenance.js'
import { ZOD_FORMATS } from './zod-codegen.js'

/** Where a project declares its own tables, relative to its root. */
export const TABLES_FILE = 'db/tables.ts'

/** The export of {@link TABLES_FILE} that holds the declaration. */
const TABLES_EXPORT = 'tables'

const snakeCase = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

/** A loaded `db/tables.ts`, in the physical names the generator compares on. */
export interface TableDeclaration {
  schema: PikkuSchema
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

/**
 * Check one annotation entry and return what is wrong with it.
 *
 * `db/annotations.ts` parses leniently: an unknown value is dropped. Here that
 * would mean a typo in `security: 'pi'` leaves a column with personal data at
 * the default level with nothing said, so every field is checked.
 */
function annotationProblems(
  at: string,
  entry: Record<string, unknown>
): string[] {
  const problems: string[] = []
  for (const [field, value] of Object.entries(entry)) {
    const allowed = ALLOWED_VALUES[field as keyof ColumnAnnotation]
    if (!allowed) {
      problems.push(`${at} has an unknown annotation '${field}'`)
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

function physicalAnnotations(raw: unknown, file: string): TableAnnotations {
  if (raw === undefined) return {}
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${file}: annotations must be keyed by table, then column.`)
  }
  const annotations: TableAnnotations = {}
  const problems: string[] = []
  for (const [table, columns] of Object.entries(raw)) {
    if (typeof columns !== 'object' || columns === null) {
      problems.push(`${table} must be an object of columns`)
      continue
    }
    const physical = (annotations[snakeCase(table)] ??= {})
    for (const [column, entry] of Object.entries(columns)) {
      if (typeof entry !== 'object' || entry === null) {
        problems.push(`${table}.${column} must be an object`)
        continue
      }
      problems.push(
        ...annotationProblems(
          `${table}.${column}`,
          entry as Record<string, unknown>
        )
      )
      physical[snakeCase(column)] = entry as ColumnAnnotation
    }
  }
  if (problems.length > 0) {
    throw new Error(`${file}: ${problems.join('; ')}.`)
  }
  return annotations
}

/**
 * Read `db/tables.ts`, or `null` when the project declares nothing.
 *
 * The file's presence is the opt-in, so its absence changes nothing for a
 * project on hand-written migrations. A file that is present and cannot be read
 * is the opposite case and stops the command: carrying on would treat every
 * table it declares, and every classification on them, as if it were not there.
 */
export async function loadTableDeclaration(
  rootDir: string
): Promise<TableDeclaration | null> {
  const file = join(rootDir, TABLES_FILE)
  if (!existsSync(file)) return null

  let exported: unknown
  try {
    exported = (await loadFreshUserModule(file))[TABLES_EXPORT]
  } catch (error: any) {
    throw new Error(`${TABLES_FILE} could not be loaded: ${error.message}`)
  }

  const tables = exported as Partial<AppTables> | undefined
  if (!tables || !Array.isArray(tables.statements)) {
    throw new Error(
      `${TABLES_FILE} must export \`const ${TABLES_EXPORT} = defineTables({ statements: [...] })\`.`
    )
  }

  return {
    schema: {
      name: APP_TABLES_SOURCE,
      statements: tables.statements,
      requires: tables.requires,
    },
    annotations: physicalAnnotations(tables.annotations, TABLES_FILE),
  }
}

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

/** Annotations that name a table or column the declaration does not have. */
export function strayAnnotations(
  annotations: TableAnnotations,
  tables: Map<string, Map<string, ColumnInfo>>
): string[] {
  const stray: string[] = []
  for (const [table, columns] of Object.entries(annotations)) {
    const declared = tables.get(table)
    if (!declared) {
      stray.push(
        `${TABLES_FILE} annotates ${table}, which it does not declare.`
      )
      continue
    }
    for (const column of Object.keys(columns)) {
      if (!declared.has(column)) {
        stray.push(
          `${TABLES_FILE} annotates ${table}.${column}, which ${table} does not declare, ` +
            'so the column it means has no classification.'
        )
      }
    }
  }
  return stray
}

// ─── Annotations ─────────────────────────────────────────────────────────────

/**
 * `db/annotations.ts` with the declaration's annotations folded in.
 *
 * The result is what the sidecar holds, so every reader — codegen, the console,
 * the audit — keeps one place to look. A column annotated in both is fine while
 * they agree (`pikku db annotate` writes a `kind` the declaration may also
 * state). When they disagree this stops: picking one would let an old file
 * quietly lower a column's classification.
 */
export function mergeAnnotations(
  authored: Record<string, Record<string, unknown>>,
  declared: TableAnnotations
): Record<string, Record<string, unknown>> {
  const conflicts: string[] = []
  const flat = new Map(flattenAnnotationTables(authored))
  const merged: Record<string, Record<string, unknown>> = structuredClone(
    authored
  )

  for (const [table, columns] of Object.entries(declared)) {
    const existing = flat.get(table) ?? {}
    // From the flattened view, so a table nested under its schema keeps the
    // columns only `db/annotations.ts` names: the reader takes the last copy.
    const entry: Record<string, unknown> = { ...existing }
    for (const [column, annotation] of Object.entries(columns)) {
      const other = (existing[column] ?? {}) as Record<string, unknown>
      for (const [field, value] of Object.entries(annotation)) {
        if (other[field] !== undefined && other[field] !== value) {
          conflicts.push(
            `${table}.${column}.${field} is '${String(other[field])}' in db/annotations.ts and '${String(value)}' in ${TABLES_FILE}`
          )
        }
      }
      entry[column] = { ...other, ...annotation }
    }
    merged[table] = entry
  }

  if (conflicts.length > 0) {
    throw new Error(
      `Annotations disagree: ${conflicts.join('; ')}. Keep them in ${TABLES_FILE} and remove them from db/annotations.ts.`
    )
  }
  return merged
}
