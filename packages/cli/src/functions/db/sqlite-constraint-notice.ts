import type { TablesDeclaration } from '@pikku/core/db'

/** The `validate.rules` id that silences the notice, the one place Pikku already lets a project turn a rule off. */
export const SQLITE_UNENFORCED_RULE = 'db-sqlite-unenforced-constraints'

const snake = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()

const literal = (value: unknown): string =>
  typeof value === 'number'
    ? String(value)
    : `'${String(value).replace(/'/g, "''")}'`

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
): { where: string; constraint: string; check: string }[] {
  const found: { where: string; constraint: string; check: string }[] = []
  for (const [table, declaration] of Object.entries(tables)) {
    for (const [name, column] of Object.entries(declaration.columns)) {
      const col = `"${snake(name)}"`
      const where = `${snake(table)}.${snake(name)}`
      const add = (constraint: string, check: string) =>
        found.push({ where, constraint, check: `CHECK (${check})` })
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
  tables: TablesDeclaration
): string | undefined {
  const found = declaredConstraints(tables)
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
