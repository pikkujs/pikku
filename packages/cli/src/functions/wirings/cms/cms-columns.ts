/**
 * What the generators agree a column is: the shape its value has on the wire,
 * and the zod each input accepts.
 */
import type { CmsColumn } from './cms-model.types.js'

/** The shape a value has in a request or a response, whatever the engine stores. */
export type CmsValueKind = 'string' | 'number' | 'boolean' | 'datetime'

export const valueKind = (column: CmsColumn): CmsValueKind => {
  if (column.family === 'boolean' || column.kind === 'bool') return 'boolean'
  if (column.family === 'timestamp' || column.kind === 'date') return 'datetime'
  return ['integer', 'bigint', 'real'].includes(column.family)
    ? 'number'
    : 'string'
}

/** What a response carries in a column. */
export const outputSchema = (column: CmsColumn): string => {
  const kind = valueKind(column)
  const base =
    kind === 'number'
      ? 'z.number()'
      : kind === 'boolean'
        ? 'z.boolean()'
        : 'z.string()'
  return column.nullable ? `${base}.nullable()` : base
}

// Postgres answers a value that does not fit the column's type with a server
// error, so each one is refused here, as any other bad input.
const DATETIME =
  '/^\\d{4}-\\d{2}-\\d{2}([T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d{1,6})?)?(Z|[+-]\\d{2}(:?\\d{2})?)?)?$/'
const DATE = '/^\\d{4}-\\d{2}-\\d{2}$/'
const UUID =
  '/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/'

const INTEGER = 'z.number().int().min(-2147483648).max(2147483647)'
const BIGINT =
  'z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)'

/** A value a caller compares a column with. */
export const operandSchema = (column: CmsColumn): string => {
  if (column.enum) return `z.enum(${JSON.stringify(column.enum)})`
  const kind = valueKind(column)
  if (kind === 'boolean') return 'z.boolean()'
  if (kind === 'datetime') return `z.string().regex(${DATETIME})`
  if (column.format === 'isoDate') return `z.string().regex(${DATE})`
  if (column.family === 'uuid') return `z.string().regex(${UUID})`
  if (column.family === 'integer') return INTEGER
  if (column.family === 'bigint') return BIGINT
  if (kind === 'number') return 'z.number()'
  return 'z.string().max(1000)'
}

/** The filter operators that mean something for a column. */
export const filterOperators = (column: CmsColumn): string[] => {
  const kind = valueKind(column)
  if (kind === 'boolean') return ['equals']
  const ordered =
    !column.enum &&
    (kind === 'number' || kind === 'datetime' || column.format === 'isoDate')
  return ['equals', 'in', ...(ordered ? ['gt', 'gte', 'lt', 'lte'] : [])]
}

/** A record's id as a caller sends it. */
export const idSchema = (column: CmsColumn): string => {
  if (column.family === 'uuid') return `z.string().regex(${UUID})`
  if (column.family === 'integer') return INTEGER
  if (column.family === 'bigint') return BIGINT
  return `z.string().min(1).max(${column.maxLength ?? 255})`
}

export const datetimePattern = DATETIME
export const datePattern = DATE
export const uuidPattern = UUID
export const integerSchema = INTEGER
export const bigintSchema = BIGINT
