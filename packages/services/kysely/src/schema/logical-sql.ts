import { sql, type RawBuilder } from 'kysely'
import type {
  ColumnDefault,
  ColumnOnUpdate,
  DbEngine,
  EngineSql,
} from '@pikku/core/db'

export const ENGINES: readonly DbEngine[] = ['postgres', 'mysql', 'sqlite']

const NOW_SQL: Record<DbEngine, string> = {
  postgres: 'now()',
  mysql: 'CURRENT_TIMESTAMP',
  sqlite: 'CURRENT_TIMESTAMP',
}

/** A version 4 UUID in the 8-4-4-4-12 form, from SQLite's random bytes. */
export const SQLITE_UUID_SQL =
  "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || " +
  "substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || " +
  "substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))"

const UUID_SQL: Record<DbEngine, string> = {
  postgres: 'gen_random_uuid()',
  mysql: '(UUID())',
  sqlite: SQLITE_UUID_SQL,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** What is wrong with a value that should be SQL written once per engine. */
export const engineSqlProblems = (what: string, value: unknown): string[] => {
  if (!isRecord(value)) {
    return [
      `${what} must be an object with the SQL for each engine, such as { postgres: '...', sqlite: '...' }.`,
    ]
  }
  const problems: string[] = []
  const keys = Object.keys(value)
  for (const key of keys) {
    if (!ENGINES.includes(key as DbEngine)) {
      problems.push(
        `${what} has the unknown engine '${key}'. The engines are ${ENGINES.join(', ')}.`
      )
    } else if (typeof value[key] !== 'string' || value[key].trim() === '') {
      problems.push(
        `${what} has no SQL for ${key}: it must be a non-empty string.`
      )
    }
  }
  if (keys.length === 0) {
    problems.push(
      `${what} names no engine. Give it at least the one the project uses.`
    )
  }
  return problems
}

/** The SQL for `engine`, or an error naming what needs it. */
export const sqlFor = (
  value: EngineSql,
  engine: DbEngine,
  what: string
): string => {
  const written = value[engine]
  if (written === undefined) {
    throw new Error(
      `${what} has no SQL for ${engine}, the project's engine. Add { ${engine}: '...' }.`
    )
  }
  return written
}

/**
 * What is wrong with a `default` or `onUpdate`, whichever engine it will be
 * compiled for.
 */
export const logicalProblems = (
  here: string,
  field: 'default' | 'onUpdate',
  value: unknown
): string[] => {
  if (!isRecord(value)) {
    return typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
      ? []
      : [
          `'${here}' ${field} must be a literal, { now: true }${field === 'default' ? ', { uuid: true }' : ''} or { sql: { ... } }.`,
        ]
  }
  const keys = Object.keys(value)
  const known = field === 'default' ? ['now', 'uuid', 'sql'] : ['now', 'sql']
  const unknown = keys.filter((key) => !known.includes(key))
  if (unknown.length > 0) {
    return [
      `'${here}' ${field} has the unknown key '${unknown[0]}'. It takes ${known.map((k) => `'${k}'`).join(', ')}.`,
    ]
  }
  if (keys.length !== 1) {
    return [`'${here}' ${field} must have exactly one of ${known.join(', ')}.`]
  }
  const [key] = keys
  if (key === 'sql') {
    return engineSqlProblems(`'${here}' ${field}.sql`, value.sql)
  }
  return value[key!] === true ? [] : [`'${here}' ${field}.${key} must be true.`]
}

/** The SQL expression a logical default or onUpdate stands for on `engine`. */
export const logicalExpression = (
  value: ColumnDefault | ColumnOnUpdate,
  engine: DbEngine,
  what: string
): RawBuilder<unknown> | string | number | boolean => {
  if (typeof value !== 'object') return value
  if ('now' in value) return sql.raw(NOW_SQL[engine])
  if ('uuid' in value) return sql.raw(UUID_SQL[engine])
  return sql.raw(sqlFor(value.sql, engine, what))
}

/** The same expression as text, for a trigger that has to carry it. */
export const logicalText = (
  value: ColumnOnUpdate,
  engine: DbEngine,
  what: string
): string => {
  if (typeof value === 'object') {
    return 'now' in value ? NOW_SQL[engine] : sqlFor(value.sql, engine, what)
  }
  return typeof value === 'string'
    ? `'${value.replace(/'/g, "''")}'`
    : String(value)
}
