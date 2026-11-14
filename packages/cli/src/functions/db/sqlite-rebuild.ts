/**
 * Changing a `CHECK` on a sqlite column that already exists.
 *
 * SQLite cannot alter a constraint, so the table is rebuilt the way its own
 * documentation prescribes: a new table with the new definition, the rows
 * copied across, the old table dropped, the new one renamed, then the indexes,
 * triggers and views put back. Foreign key enforcement has to be off for that,
 * which a pragma can only do outside a transaction; the migration says so with
 * `SQLITE_FOREIGN_KEYS_OFF_MARKER` and `SqliteMigrationExecutor` does the rest,
 * checking `foreign_key_check` before it commits.
 *
 * The new definition is the table's own `CREATE TABLE` from the migrations
 * with only the named checks edited, so a foreign key, a `UNIQUE` or a check a
 * person wrote by hand survives untouched.
 */
import {
  SQLITE_FOREIGN_KEYS_OFF_MARKER,
  stripSqliteComments,
} from '@pikku/migrator-sql/sqlite'
import {
  DESTRUCTIVE_MIGRATION_MARKER,
  createTableBody,
  splitTopLevel,
} from '@pikku/migrator-sql'

export interface SqliteObject {
  type: string
  name: string
  tbl_name: string
  sql: string | null
}

export interface TableRebuild {
  table: string
  /** The table's `CREATE TABLE`, as the migrations left it. */
  ddl: string
  /** Every column to copy; generated ones are left out by the caller. */
  columns: string[]
  /** Checks to remove, by name, and where each sits. */
  drop: { column: string; name: string }[]
  /** Checks to add, with the condition already written for sqlite. */
  add: { column: string; name: string; expression: string }[]
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`

const TABLE_LEVEL = /^(constraint|primary|unique|check|foreign)\b/i

/** The column a definition part declares, or `undefined` for a table-level constraint. */
function columnOf(part: string): string | undefined {
  if (TABLE_LEVEL.test(part)) return undefined
  const m =
    /^(?:"((?:[^"]|"")+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][\w$]*))/.exec(part)
  if (!m) return undefined
  return (m[1]?.replace(/""/g, '"') ?? m[2] ?? m[3] ?? m[4])!.toLowerCase()
}

/** `part` without `constraint <name> check (...)`, or `undefined` if it holds none. */
function withoutNamedCheck(part: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const header = new RegExp(
    `\\s*constraint\\s+(?:"${escaped}"|\`${escaped}\`|\\[${escaped}\\]|${escaped})\\s+check\\s*\\(`,
    'i'
  ).exec(part)
  if (!header) return undefined
  let depth = 1
  let i = header.index + header[0].length
  while (i < part.length) {
    const c = part[i]!
    if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < part.length) {
        if (part[i] === c) {
          if (part[i + 1] === c) {
            i += 2
            continue
          }
          break
        }
        i++
      }
    } else if (c === '(') depth++
    else if (c === ')' && --depth === 0) {
      return part.slice(0, header.index) + part.slice(i + 1)
    }
    i++
  }
  return undefined
}

/** The rebuilt table's `CREATE TABLE` under `newName`, or the reason it cannot be made. */
export function rebuiltDefinition(
  rebuild: TableRebuild,
  newName: string
): { ddl: string } | { problem: string } {
  // A `--` comment on the last column would swallow the constraint appended to it.
  const ddl = stripSqliteComments(rebuild.ddl)
  const parts = splitTopLevel(createTableBody(ddl))
  const tail = ddl.slice(ddl.lastIndexOf(')') + 1)
  const edited = [...parts]
  const find = (column: string) =>
    edited.findIndex((part) => columnOf(part) === column.toLowerCase())

  for (const { column, name } of rebuild.drop) {
    const at = find(column)
    const without = at >= 0 ? withoutNamedCheck(edited[at]!, name) : undefined
    if (without === undefined) {
      return {
        problem: `${rebuild.table}.${column}: ${name} is not written on the column in the table's definition, so generate cannot take it out`,
      }
    }
    edited[at] = without
  }
  for (const { column, name, expression } of rebuild.add) {
    const at = find(column)
    if (at < 0) {
      return {
        problem: `${rebuild.table}.${column} is not a column definition of the table, so generate cannot add ${name} to it`,
      }
    }
    edited[at] = `${edited[at]} constraint ${quote(name)} check (${expression})`
  }
  return {
    ddl: `CREATE TABLE ${quote(newName)} (${edited.join(', ')})${tail.replace(/;\s*$/, '')};`,
  }
}

/**
 * The migration that rebuilds these tables, or why it cannot be written.
 *
 * Views and triggers are dropped first and recreated last, in the order they
 * were made: renaming a table fails while a view or trigger still names one
 * that is missing, and anything that names the old table has to meet the new one.
 */
export function sqliteRebuildMigration(
  rebuilds: TableRebuild[],
  objects: SqliteObject[]
): { sql: string } | { problem: string } {
  const dependents = objects.filter(
    (o) => (o.type === 'view' || o.type === 'trigger') && o.sql
  )
  const steps: string[] = [
    `${DESTRUCTIVE_MIGRATION_MARKER}rebuilds ${rebuilds.map((r) => quote(r.table)).join(', ')}: rows are copied into a new table and the old one is dropped`,
    SQLITE_FOREIGN_KEYS_OFF_MARKER,
    ...[...dependents]
      .reverse()
      .map(
        (o) =>
          `DROP ${o.type === 'view' ? 'VIEW' : 'TRIGGER'} ${quote(o.name)};`
      ),
  ]
  for (const rebuild of rebuilds) {
    const temp = `pikku_rebuild_${rebuild.table}`
    const definition = rebuiltDefinition(rebuild, temp)
    if ('problem' in definition) return definition
    const columns = rebuild.columns.map(quote).join(', ')
    // A table with a rowid keeps each row's: an external-content FTS index, a
    // vec0 table or anything else keyed on it points at rowids, and a table
    // with a TEXT primary key has no other stable handle.
    const ddl = stripSqliteComments(rebuild.ddl)
    const hasRowid =
      !/\bwithout\s+rowid\b/i.test(ddl.slice(ddl.lastIndexOf(')'))) &&
      !rebuild.columns.some((c) =>
        ['rowid', 'oid', '_rowid_'].includes(c.toLowerCase())
      )
    const target = hasRowid ? `rowid, ${columns}` : columns
    const sequence = /\bautoincrement\b/i.test(ddl)
    steps.push(
      definition.ddl,
      `INSERT INTO ${quote(temp)} (${target}) SELECT ${target} FROM ${quote(rebuild.table)};`,
      // The copy leaves the sequence at the highest id still there; the old
      // table's is the highest ever handed out, and ids must not be reused.
      ...(sequence
        ? [
            `DELETE FROM sqlite_sequence WHERE name = '${temp.replace(/'/g, "''")}';`,
            `INSERT INTO sqlite_sequence (name, seq) SELECT '${temp.replace(/'/g, "''")}', seq FROM sqlite_sequence WHERE name = '${rebuild.table.replace(/'/g, "''")}';`,
          ]
        : []),
      `DROP TABLE ${quote(rebuild.table)};`,
      `ALTER TABLE ${quote(temp)} RENAME TO ${quote(rebuild.table)};`,
      ...objects
        .filter(
          (o) =>
            o.type === 'index' &&
            o.sql &&
            o.tbl_name.toLowerCase() === rebuild.table.toLowerCase()
        )
        .map((o) => `${o.sql!.replace(/;\s*$/, '')};`)
    )
  }
  steps.push(...dependents.map((o) => `${o.sql!.replace(/;\s*$/, '')};`))
  return { sql: steps.join('\n') }
}
