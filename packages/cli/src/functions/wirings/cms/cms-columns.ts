/**
 * What the generators agree a column is: the shape its value has on the wire,
 * and the zod each input accepts.
 */
import { ZOD_FORMATS, type ZodFormat } from '../../db/zod-codegen.js'
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
// Postgres stores no NUL character in text.
const NO_NUL = '.regex(/^[^\\x00]*$/)'
// zod's url takes any scheme, and a `javascript:` link runs when it is clicked.
const WEB_URL = '.regex(/^[Hh][Tt][Tt][Pp][Ss]?:\\/\\//)'

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
  return `z.string().max(1000)${NO_NUL}`
}

const RANGES: Partial<Record<CmsColumn['family'], [number, number]>> = {
  integer: [-2147483648, 2147483647],
  bigint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
}

const numberSchema = (column: CmsColumn): string => {
  const range = RANGES[column.family]
  const low = Math.max(range?.[0] ?? -Infinity, column.min ?? -Infinity)
  const high = Math.min(range?.[1] ?? Infinity, column.max ?? Infinity)
  return [
    'z.number()',
    range ? '.int()' : '',
    Number.isFinite(low) ? `.min(${low})` : '',
    Number.isFinite(high) ? `.max(${high})` : '',
  ].join('')
}

const stringSchema = (column: CmsColumn): string => {
  const format = column.format as ZodFormat | undefined
  return [
    format && Object.hasOwn(ZOD_FORMATS, format)
      ? ZOD_FORMATS[format]
      : 'z.string()',
    format === 'url' ? WEB_URL : '',
    column.minLength !== undefined ? `.min(${column.minLength})` : '',
    column.maxLength !== undefined ? `.max(${column.maxLength})` : '',
    column.pattern !== undefined
      ? `.regex(new RegExp(${JSON.stringify(column.pattern)}))`
      : '',
    NO_NUL,
  ].join('')
}

/** A value a caller stores in a column, `null` aside. */
export const valueSchema = (column: CmsColumn): string => {
  if (column.enum) return `z.enum(${JSON.stringify(column.enum)})`
  const kind = valueKind(column)
  if (kind === 'boolean') return 'z.boolean()'
  if (kind === 'datetime') return `z.string().regex(${DATETIME})`
  if (column.format === 'isoDatetime') return `z.string().regex(${DATETIME})`
  if (kind === 'number') return numberSchema(column)
  if (column.family === 'uuid') return `z.string().regex(${UUID})`
  return stringSchema(column)
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
  return `z.string().min(1).max(${column.maxLength ?? 255})${NO_NUL}`
}
