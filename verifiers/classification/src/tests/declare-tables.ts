import { writeFile } from 'fs/promises'
import { join } from 'path'

/** What a column in `db/tables.ts` says about itself beyond its shape. */
export type ColumnEntry = {
  security?: 'public' | 'private' | 'pii' | 'secret'
  classification?: 'fake:email' | 'fake:name' | 'hash' | 'keep'
  kind?: 'date' | 'bool' | 'json' | 'uuid'
  tsType?: string
  format?: string
}

/** Annotations keyed by physical table, then physical column. */
export type Annotations = Record<string, Record<string, ColumnEntry>>

/** The declared type for a SQL type, in the words `db/tables.ts` uses. */
const declaredType = (sqlType: string): string => {
  const t = sqlType.toLowerCase()
  if (/bool/.test(t)) return 'boolean'
  if (/uuid/.test(t)) return 'uuid'
  if (/json/.test(t)) return 'json'
  if (/int/.test(t)) return 'integer'
  if (/real|double|float|numeric|decimal/.test(t)) return 'real'
  if (/timestamp|datetime|date|time/.test(t)) return 'timestamp'
  return 'text'
}

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The SQL type the migrations give `table.column`, from its CREATE or ALTER. */
function sqlTypeOf(sql: string, table: string, column: string): string {
  const t = escape(table)
  const segments: string[] = []
  const create = new RegExp(
    `CREATE TABLE(?: IF NOT EXISTS)?\\s+(?:"?\\w+"?\\.)?"?${t}"?\\s*\\(([\\s\\S]*?)\\);`,
    'i'
  ).exec(sql)
  if (create) segments.push(create[1]!)
  const alter = new RegExp(
    `ALTER TABLE\\s+(?:"?\\w+"?\\.)?"?${t}"?\\s+ADD(?: COLUMN)?([^;]*);`,
    'gi'
  )
  for (const match of sql.matchAll(alter)) segments.push(match[1]!)
  const column_ = new RegExp(
    `(?:^|[\\s,(])"?${escape(column)}"?\\s+(\\w+)`,
    'i'
  )
  for (const segment of segments) {
    const found = column_.exec(segment)
    if (found) return found[1]!
  }
  return 'text'
}

/**
 * Writes `db/tables.ts` declaring each annotated table `declareOnly`: the
 * migrations create it, and the declaration only carries its annotations.
 * Each column is typed from the SQL that made it.
 */
export async function declareAnnotations(
  dir: string,
  annotations: Annotations,
  sql: string
): Promise<void> {
  const tables = Object.fromEntries(
    Object.entries(annotations).map(([table, columns]) => [
      table,
      {
        declareOnly: true,
        columns: Object.fromEntries(
          Object.entries(columns).map(([column, entry]) => [
            column,
            { type: declaredType(sqlTypeOf(sql, table, column)), ...entry },
          ])
        ),
      },
    ])
  )
  await writeFile(
    join(dir, 'db', 'tables.ts'),
    `export const tables = ${JSON.stringify(tables, null, 2)}\n`
  )
  // An app is an ES module project, and the CLI loads db/tables.ts as one.
  await writeFile(join(dir, 'package.json'), '{ "type": "module" }\n')
}
