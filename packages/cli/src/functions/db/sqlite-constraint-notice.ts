import type { TablesDeclaration } from '@pikku/core/db'
import type { ColumnCheck } from './db-introspector.js'
import { checkFingerprint } from './check-enums.js'
import { snakeCase as snake } from './snake-case.js'

/** The `validate.rules` id that silences the notice, the one place Pikku already lets a project turn a rule off. */
export const SQLITE_UNENFORCED_RULE = 'db-sqlite-unenforced-constraints'

const literal = (value: unknown): string =>
  typeof value === 'number'
    ? String(value)
    : `'${String(value).replace(/'/g, "''")}'`

export interface DeclaredConstraint {
  where: string
  /** The physical table and column, to look the constraint up where the migrations hold it. */
  table: string
  column: string
  constraint: string
  check: string
  /** The condition alone, as `check` wraps it. */
  condition: string
}

/**
 * The constraints a declaration asks for, each with the `CHECK` a person could
 * write by hand. On SQLite these are the ones the database will not enforce;
 * on MySQL they are what an older server would silently ignore.
 *
 * SQLite cannot drop or change a `CHECK` without rebuilding the table, so Pikku
 * writes none there. The constraints still drive validation, generated types
 * and the console; only the database stops checking them.
 */
export function declaredConstraints(
  tables: TablesDeclaration
): DeclaredConstraint[] {
  const found: DeclaredConstraint[] = []
  for (const [table, declaration] of Object.entries(tables)) {
    for (const [name, column] of Object.entries(declaration.columns)) {
      const col = `"${snake(name)}"`
      const where = `${snake(table)}.${snake(name)}`
      const add = (constraint: string, condition: string) =>
        found.push({
          where,
          table: snake(table),
          column: snake(name),
          constraint,
          check: `CHECK (${condition})`,
          condition,
        })
      if (column.enum) {
        add(
          `one of ${column.enum.join(', ')}`,
          `${col} IN (${column.enum.map(literal).join(', ')})`
        )
      }
      if (column.min !== undefined) {
        add(`min ${column.min}`, `${col} >= ${literal(column.min)}`)
      }
      if (column.max !== undefined) {
        add(`max ${column.max}`, `${col} <= ${literal(column.max)}`)
      }
      if (column.minLength !== undefined) {
        add(
          `minLength ${column.minLength}`,
          `length(${col}) >= ${literal(column.minLength)}`
        )
      }
      if (column.maxLength !== undefined) {
        add(
          `maxLength ${column.maxLength}`,
          `length(${col}) <= ${literal(column.maxLength)}`
        )
      }
    }
  }
  return found
}

/** The one notice for a generate or check run, or none when nothing is declared that SQLite leaves unenforced. */
export function sqliteConstraintNotice(
  tables: TablesDeclaration,
  held: (
    table: string,
    column: string
  ) => readonly ColumnCheck[] | undefined = () => undefined
): string | undefined {
  // A constraint the migrations already enforce, under any name, is left out;
  // it is compared by what it says, so `CHECK (kind IN ('a','b'))` written by
  // hand matches the declared enum.
  const found = declaredConstraints(tables).filter((c) => {
    const have = held(c.table, c.column) ?? []
    const wanted = checkFingerprint(c.condition)
    return !have.some((h) => checkFingerprint(h.expression) === wanted)
  })
  if (found.length === 0) return undefined
  return [
    `These declared constraints are not enforced by the database on SQLite (they still drive validation, generated types and the console):`,
    ...found.map((f) => `  ${f.where}: ${f.constraint}`),
    `To have the database enforce them: (1) use Postgres or MySQL, where Pikku generates and manages the CHECKs, or`,
    `(2) add them in a hand-written migration (SQLite needs a table rebuild to add a CHECK). Suggested:`,
    ...found.map((f) => `  ${f.where}: ${f.check}`),
    `Silence this with validate.rules["${SQLITE_UNENFORCED_RULE}"] = "off" in your Pikku config.`,
  ].join('\n')
}
