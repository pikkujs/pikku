import {
  CamelCasePlugin,
  sql,
  type CreateTableBuilder,
  type Kysely,
  type SqlBool,
} from 'kysely'
import type {
  ColumnDeclaration,
  ColumnDefault,
  ColumnType,
  NamedConstraint,
  TableDeclaration,
  TablesDeclaration,
} from '@pikku/core/db'
import {
  requiredType,
  type ForeignKeyTarget,
  type RequiredTypes,
  type SchemaContext,
  type SchemaRequirement,
  type SchemaStatementFactory,
} from './pikku-schema.types.js'

type DataTypeExpression = Parameters<
  CreateTableBuilder<any, any>['addColumn']
>[1]

const SIMPLE_TYPES = new Set<string>([
  'id',
  'key',
  'text',
  'integer',
  'bigint',
  'real',
  'boolean',
  'timestamp',
  'timestamptz',
  'uuid',
  'json',
])
const BOUNDED_STRING = /^string\((\d+)\)$/

/** Exposes the conversion `CamelCasePlugin` applies, so names match it exactly (`apiURL` is `api_url`). */
class PhysicalNames extends CamelCasePlugin {
  physical(name: string): string {
    return this.snakeCase(name)
  }
}
const physicalNames = new PhysicalNames()

/** The physical name `CamelCasePlugin` gives a logical one. */
const snake = (name: string) => physicalNames.physical(name)

/**
 * Whether `db` compiles for postgres. Placeholders are the tell: `$1` there,
 * `?` on sqlite and MySQL.
 */
const isPostgres = (db: Kysely<any>): boolean =>
  db
    .selectFrom('pikkuDialectProbe')
    .selectAll()
    .where('probe', '=', 1)
    .compile()
    .sql.includes('$1')

/** A table constraint's columns and, when it keeps an existing one, its name. */
const constraint = (
  declared: readonly string[] | NamedConstraint
): { columns: readonly string[]; name?: string } =>
  'columns' in declared ? declared : { columns: declared }

const splitTarget = (target: string, where: string): [string, string] => {
  const parts = target.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `${where} references '${target}', which is not a 'table.column' target.`
    )
  }
  return parts as [string, string]
}

/** What a column's type resolves to: one of ours, or one read off a foreign column. */
type ResolvedType =
  | { kind: 'declared'; type: ColumnType }
  | { kind: 'foreign'; table: string; column: string }

const resolveType = (
  tables: TablesDeclaration,
  table: string,
  column: string,
  seen: string[] = []
): ResolvedType => {
  const here = `${table}.${column}`
  const declaration = tables[table]?.columns[column]
  if (!declaration) {
    throw new Error(
      `'${seen.at(-1)}' references '${here}', which is not declared.`
    )
  }
  if (declaration.type) return { kind: 'declared', type: declaration.type }
  if (seen.includes(here)) {
    throw new Error(
      `'${here}' takes its type from a reference that leads back to itself: ${[...seen, here].join(' -> ')}. Give one of them a type.`
    )
  }
  const [targetTable, targetColumn] = splitTarget(declaration.references!, here)
  if (!tables[targetTable]) {
    return { kind: 'foreign', table: targetTable, column: targetColumn }
  }
  return resolveType(tables, targetTable, targetColumn, [...seen, here])
}

/** Columns that take part in a key, which MySQL needs a bounded type for. */
const keyedColumns = (
  tables: TablesDeclaration,
  table: string
): Set<string> => {
  const declaration = tables[table]!
  const keyed = new Set<string>([
    ...(declaration.primaryKey
      ? constraint(declaration.primaryKey).columns
      : []),
    ...(declaration.unique ?? []).flatMap((group) => constraint(group).columns),
    ...(declaration.indexes ?? []).flatMap((index) => index.columns),
  ])
  for (const [name, column] of Object.entries(declaration.columns)) {
    if (
      column.primaryKey ||
      column.unique ||
      column.index ||
      column.references
    ) {
      keyed.add(name)
    }
  }
  for (const other of Object.values(tables)) {
    for (const column of Object.values(other.columns)) {
      if (!column.references) continue
      const [targetTable, targetColumn] = column.references.split('.')
      if (targetTable === table && targetColumn) keyed.add(targetColumn)
    }
  }
  return keyed
}

const dataType = (
  type: ColumnType,
  keyed: boolean,
  ctx: SchemaContext,
  postgres: boolean
): DataTypeExpression => {
  const bounded = BOUNDED_STRING.exec(type)
  if (bounded) return sql.raw(`varchar(${bounded[1]})`)
  switch (type) {
    case 'id':
    case 'key':
      return ctx.key
    case 'text':
      return keyed ? ctx.key : ctx.text
    case 'timestamptz':
      return postgres ? 'timestamptz' : 'timestamp'
    case 'uuid':
      return postgres ? 'uuid' : ctx.mysql ? sql.raw('char(36)') : 'text'
    case 'json':
      return postgres ? 'jsonb' : ctx.mysql ? 'json' : 'text'
    default:
      return type as 'integer' | 'bigint' | 'real' | 'boolean' | 'timestamp'
  }
}

const defaultValue = (value: ColumnDefault, ctx: SchemaContext) => {
  if (typeof value === 'object') {
    return 'now' in value ? sql`CURRENT_TIMESTAMP` : sql.raw(value.sql)
  }
  return typeof value === 'string' ? ctx.defaultText(value) : value
}

const validate = (tables: TablesDeclaration): void => {
  for (const [table, declaration] of Object.entries(tables)) {
    const columns = declaration.columns
    const known = (names: readonly string[], what: string) => {
      for (const name of names) {
        if (!columns[name]) {
          throw new Error(
            `Table '${table}' names '${name}' in its ${what}, which is not one of its columns.`
          )
        }
      }
    }
    const primaryKey = declaration.primaryKey
      ? constraint(declaration.primaryKey).columns
      : []
    known(primaryKey, 'primary key')
    for (const group of declaration.unique ?? [])
      known(constraint(group).columns, 'unique constraints')
    for (const index of declaration.indexes ?? [])
      known(index.columns, 'indexes')

    const columnKeys = Object.entries(columns).filter(([, c]) => c.primaryKey)
    if (declaration.primaryKey && columnKeys.length > 0) {
      throw new Error(
        `Table '${table}' declares a primary key on the table and on column '${columnKeys[0]![0]}'. Use one: the table's for a composite key.`
      )
    }
    if (columnKeys.length > 1) {
      throw new Error(
        `Table '${table}' marks ${columnKeys.map(([name]) => `'${name}'`).join(' and ')} as primary keys. A composite key goes in the table's 'primaryKey'.`
      )
    }

    for (const [name, column] of Object.entries(columns)) {
      const here = `${table}.${name}`
      const bounded = column.type ? BOUNDED_STRING.exec(column.type) : null
      if (column.type && !SIMPLE_TYPES.has(column.type) && !bounded) {
        throw new Error(
          `'${here}' has type '${column.type}', which is not a column type.`
        )
      }
      if (bounded && Number(bounded[1]) < 1) {
        throw new Error(
          `'${here}' has type '${column.type}'. A bounded string needs a length of at least 1.`
        )
      }
      if (!column.type && !column.references) {
        throw new Error(
          `'${here}' has no type. Give it one, or a 'references' to take its target's.`
        )
      }
      if (column.onDelete && !column.references) {
        throw new Error(
          `'${here}' sets onDelete without a 'references' for it to apply to.`
        )
      }
      if (
        column.onDelete === 'setNull' &&
        (column.required || column.primaryKey || primaryKey.includes(name))
      ) {
        throw new Error(
          `'${here}' is required, so onDelete 'setNull' could never succeed. Make it optional, or choose another onDelete.`
        )
      }
      if (column.references) {
        const [targetTable, targetColumn] = splitTarget(column.references, here)
        if (
          tables[targetTable] &&
          !tables[targetTable]!.columns[targetColumn]
        ) {
          throw new Error(
            `'${here}' references '${column.references}', but '${targetTable}' declares no column '${targetColumn}'.`
          )
        }
        resolveType(tables, table, name)
      }
    }
  }
}

/**
 * The columns a declaration references outside itself, which something else
 * has to have created first — the `requires` of the `PikkuSchema` it becomes.
 *
 * In physical names, because `resolveRequirements` matches them against
 * introspection.
 */
export const tableRequirements = (
  tables: TablesDeclaration,
  owner = 'another source'
): SchemaRequirement[] => {
  const seen = new Set<string>()
  const requirements: SchemaRequirement[] = []
  for (const declaration of Object.values(tables)) {
    for (const column of Object.values(declaration.columns)) {
      if (!column.references) continue
      const [table, target] = column.references.split('.') as [string, string]
      if (tables[table]) continue
      const requirement = { table: snake(table), column: snake(target), owner }
      const key = `${requirement.table}.${requirement.column}`
      if (seen.has(key)) continue
      seen.add(key)
      requirements.push(requirement)
    }
  }
  return requirements
}

const createTable = (
  tables: TablesDeclaration,
  table: string,
  declaration: TableDeclaration
): SchemaStatementFactory => {
  const keyed = keyedColumns(tables, table)
  return (db, types: RequiredTypes, ctx) => {
    const postgres = isPostgres(db)
    let builder = db.schema.createTable(table)
    const foreignKeys: Record<string, ForeignKeyTarget> = {}
    for (const [name, column] of Object.entries(declaration.columns) as [
      string,
      ColumnDeclaration,
    ][]) {
      const resolved = resolveType(tables, table, name)
      const type =
        resolved.kind === 'declared'
          ? dataType(resolved.type, keyed.has(name), ctx, postgres)
          : requiredType(types, snake(resolved.table), snake(resolved.column))
      builder = builder.addColumn(name, type, (col) => {
        if (column.primaryKey) col = col.primaryKey()
        if (column.required) col = col.notNull()
        if (column.unique) col = col.unique()
        if (column.default !== undefined) {
          col = col.defaultTo(defaultValue(column.default, ctx))
        }
        if (column.references) {
          col = ctx.references(col, column.references, column.onDelete)
        }
        return col
      })
      if (column.references) {
        foreignKeys[name] = {
          target: column.references,
          onDelete: column.onDelete ?? 'restrict',
        }
      }
    }
    if (declaration.primaryKey) {
      const { columns, name } = constraint(declaration.primaryKey)
      builder = builder.addPrimaryKeyConstraint(name ?? `${snake(table)}_pk`, [
        ...columns,
      ] as never)
    }
    for (const group of declaration.unique ?? []) {
      const { columns, name } = constraint(group)
      builder = builder.addUniqueConstraint(
        name ?? `${snake(table)}_${columns.map(snake).join('_')}_key`,
        [...columns] as never
      )
    }
    return builder.$call(ctx.foreignKeys(table, foreignKeys))
  }
}

const createIndex = (
  table: string,
  columns: readonly string[],
  options: { unique?: boolean; where?: string; name?: string }
): SchemaStatementFactory => {
  const name =
    options.name ?? `${snake(table)}_${columns.map(snake).join('_')}_idx`
  return (db, _types, ctx) => {
    if (options.where && ctx.mysql) {
      throw new Error(
        `Index '${name}' on '${table}' is partial (where ${options.where}), and MySQL has no partial indexes. ` +
          'Drop the where, or write this index by hand in a migration.'
      )
    }
    let builder = db.schema
      .createIndex(name)
      .on(table)
      .columns([...columns])
    if (options.unique) builder = builder.unique()
    if (options.where) builder = builder.where(sql.raw<SqlBool>(options.where))
    return builder
  }
}

/**
 * Compile a plain table declaration into the statements a `PikkuSchema`
 * carries: every table in declaration order, then every index.
 *
 * The declaration is checked up front, so a mistake in it is a sentence naming
 * the column rather than a database error. Dialect differences are settled when
 * a statement is bound to a database: MySQL gets bounded key types and
 * table-level foreign keys, postgres gets `timestamptz`, `uuid` and `jsonb`.
 *
 * A column that references something outside the declaration takes its type
 * from `types`, which `resolveRequirements` fills in from
 * `tableRequirements(decl)`.
 */
export const compileTables = (
  tables: TablesDeclaration
): SchemaStatementFactory[] => {
  validate(tables)
  const creates = Object.entries(tables).map(([table, declaration]) =>
    createTable(tables, table, declaration)
  )
  const indexes = Object.entries(tables).flatMap(([table, declaration]) => [
    ...Object.entries(declaration.columns)
      .filter(([, column]) => column.index)
      .map(([name]) => createIndex(table, [name], {})),
    ...(declaration.indexes ?? []).map((index) =>
      createIndex(table, index.columns, index)
    ),
  ])
  return [...creates, ...indexes]
}
