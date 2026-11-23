import {
  splitStatements,
  statementShape,
  tableDefinitions,
} from '@pikku/migrator-sql'
import type { TablesDeclaration } from '@pikku/core/db'
import { snakeCase } from './snake-case.js'
import type { TableRename } from './table-declaration.js'

/** The most bytes an identifier can have on postgres; MySQL allows one more. */
const MAX_NAME_BYTES = 63

type Dialect = 'sqlite' | 'postgres' | 'mysql'

/** What the migrations hold, by name: what a table rename may find to rename. */
export interface ExistingObjects {
  /** Every index, which on postgres and MySQL includes those behind a key. */
  indexes: Set<string>
  triggers: Set<string>
  /** Foreign key constraints by name, on the engines that name them: Postgres and MySQL. */
  foreignKeys: Set<string>
}

/** One thing the engine names after a table, as it is named now and as a fresh create names it. */
interface Named {
  kind: 'index' | 'constraint' | 'trigger' | 'foreignKey'
  from: string
  to: string
  /** What a foreign key is written as, for the engine that has to add it back under its new name. */
  definition?: string
}

/**
 * The names a table's declaration gives, or the engine gives it by default, that
 * start with the table's name. A name written in the declaration is the
 * author's, not derived from the table, so it is never in the list.
 */
function derivedNames(
  dialect: Dialect,
  table: string,
  declaration: TablesDeclaration[string],
  desiredSql: string
): { kind: Named['kind']; name: string; definition?: string }[] {
  const explicit = new Set<string>()
  for (const key of [declaration.primaryKey, ...(declaration.unique ?? [])]) {
    if (key && !Array.isArray(key) && 'name' in key) explicit.add(key.name)
  }
  for (const index of declaration.indexes ?? []) {
    if (index.name) explicit.add(index.name)
  }

  const names: {
    kind: Named['kind']
    name: string
    definition?: string
  }[] = []
  for (const statement of splitStatements(desiredSql)) {
    const shape = statementShape(statement)
    if (shape.kind === 'index' && shape.table === table) {
      names.push({ kind: 'index', name: shape.name })
    } else if (shape.kind === 'trigger' && shape.table === table) {
      names.push({ kind: 'trigger', name: shape.name })
    }
  }
  const keyed =
    dialect === 'sqlite' ? [] : tableDefinitions(desiredSql, table).constraints
  for (const constraint of keyed) {
    const named =
      /^constraint\s+["`]([^"`]+)["`]\s+(primary key|unique)\b/i.exec(
        constraint
      )
    if (!named) {
      const key = /^constraint\s+["`]([^"`]+)["`]\s+foreign key\b/i.exec(
        constraint
      )
      if (key && dialect === 'mysql') {
        names.push({
          kind: 'foreignKey',
          name: key[1]!,
          definition: constraint,
        })
      }
      continue
    }
    const [, name, what] = named
    if (what!.toLowerCase() === 'primary key' && dialect === 'mysql') continue
    names.push({
      kind: dialect === 'mysql' ? 'index' : 'constraint',
      name: name!,
    })
  }

  if (dialect === 'postgres') {
    for (const [column, entry] of Object.entries(declaration.columns)) {
      const c = snakeCase(column)
      if (entry.primaryKey && !declaration.primaryKey) {
        names.push({ kind: 'constraint', name: `${table}_pkey` })
      }
      if (entry.unique)
        names.push({ kind: 'constraint', name: `${table}_${c}_key` })
      if (entry.references) {
        names.push({ kind: 'foreignKey', name: `${table}_${c}_fkey` })
      }
    }
  }
  return names.filter(({ name }) => !explicit.has(name))
}

export interface TableRenameSql {
  /** In the order they run, all in the file that renames. */
  statements: string[]
  /** The indexes and triggers that now carry the new table's name, which the additions must not create again. */
  kept: Set<string>
}

/**
 * The statements that rename one table and what its name reaches, so the schema
 * afterwards is the one a fresh create writes.
 *
 * Postgres and MySQL rename each index, key and trigger in place. SQLite has no
 * rename for an index or a trigger, so the old one is dropped before the table
 * moves and the additions create it under the new name; the keys it keeps
 * automatically follow the table. A name only moves when the migrations hold it
 * under the old name and not yet under the new one.
 */
export function tableRenameStatements(options: {
  dialect: Dialect
  rename: TableRename
  declaration: TablesDeclaration[string]
  desiredSql: string
  existing: ExistingObjects
  quote: (name: string) => string
  qualify: (table: string) => string
  /** Postgres qualifies an index with its schema; the others do not. */
  qualifyObject: (name: string) => string
}): TableRenameSql {
  const { dialect, rename, declaration, desiredSql, existing, quote } = options
  const { from, to } = rename
  const prefix = `${to}_`
  const present = (kind: Named['kind'], name: string) =>
    (kind === 'trigger'
      ? existing.triggers
      : kind === 'foreignKey'
        ? existing.foreignKeys
        : existing.indexes
    ).has(name.toLowerCase())
  const moved: Named[] = derivedNames(dialect, to, declaration, desiredSql)
    .filter(({ name }) => name.startsWith(prefix))
    .map(({ kind, name, definition }) => ({
      kind,
      to: name,
      from: `${from}_${name.slice(prefix.length)}`,
      definition,
    }))
    .filter(
      (object) =>
        Buffer.byteLength(object.from) <= MAX_NAME_BYTES &&
        Buffer.byteLength(object.to) <= MAX_NAME_BYTES &&
        present(object.kind, object.from) &&
        !present(object.kind, object.to)
    )

  const statements: string[] = []
  const kept = new Set<string>()
  const renameTable = `ALTER TABLE ${options.qualify(from)} RENAME TO ${quote(to)};`
  const newTable = options.qualify(to)

  if (dialect === 'sqlite') {
    for (const object of moved) {
      statements.push(
        object.kind === 'trigger'
          ? `DROP TRIGGER ${quote(object.from)};`
          : `DROP INDEX ${quote(object.from)};`
      )
    }
    statements.push(renameTable)
    return { statements, kept }
  }

  statements.push(renameTable)
  for (const object of moved) {
    kept.add(object.to.toLowerCase())
    if (dialect === 'mysql' && object.kind === 'foreignKey') {
      statements.push(
        `ALTER TABLE ${newTable} DROP FOREIGN KEY ${quote(object.from)};`
      )
      if (existing.indexes.has(object.from.toLowerCase())) {
        statements.push(
          `ALTER TABLE ${newTable} RENAME INDEX ${quote(object.from)} TO ${quote(object.to)};`
        )
      }
      statements.push(`ALTER TABLE ${newTable} ADD ${object.definition};`)
    } else if (dialect === 'mysql') {
      statements.push(
        `ALTER TABLE ${newTable} RENAME INDEX ${quote(object.from)} TO ${quote(object.to)};`
      )
    } else if (object.kind === 'index') {
      statements.push(
        `ALTER INDEX ${options.qualifyObject(object.from)} RENAME TO ${quote(object.to)};`
      )
    } else if (object.kind === 'trigger') {
      statements.push(
        `ALTER TRIGGER ${quote(object.from)} ON ${newTable} RENAME TO ${quote(object.to)};`
      )
    } else {
      statements.push(
        `ALTER TABLE ${newTable} RENAME CONSTRAINT ${quote(object.from)} TO ${quote(object.to)};`
      )
    }
  }
  return { statements, kept }
}
