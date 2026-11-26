/**
 * What the generators agree a column is: the shape its value has on the wire,
 * and the zod each input accepts.
 */
import { ZOD_FORMATS, type ZodFormat } from '../../db/zod-codegen.js'
import type { CrudImageType } from '@pikku/core/crud'
import type { CrudColumn } from './crud-model.types.js'

/** The shape a value has in a request or a response, whatever the engine stores. */
export type CrudValueKind = 'string' | 'number' | 'boolean' | 'datetime'

export const valueKind = (column: CrudColumn): CrudValueKind => {
  if (column.family === 'boolean' || column.kind === 'bool') return 'boolean'
  if (column.family === 'timestamp' || column.kind === 'date') return 'datetime'
  return ['integer', 'bigint', 'real'].includes(column.family)
    ? 'number'
    : 'string'
}

/** What a response carries in a column. */
export const outputSchema = (column: CrudColumn): string => {
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
export const NO_NUL = '.regex(/^[^\\x00]*$/)'
// zod's url takes any scheme, and a `javascript:` link runs when it is clicked.
const WEB_URL = '.regex(/^[Hh][Tt][Tt][Pp][Ss]?:\\/\\//)'

/** A value a caller compares a column with. */
export const operandSchema = (column: CrudColumn): string => {
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

const RANGES: Partial<Record<CrudColumn['family'], [number, number]>> = {
  integer: [-2147483648, 2147483647],
  bigint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
}

const numberSchema = (column: CrudColumn): string => {
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

const stringSchema = (column: CrudColumn): string => {
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
export const valueSchema = (column: CrudColumn): string => {
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
export const filterOperators = (column: CrudColumn): string[] => {
  const kind = valueKind(column)
  if (kind === 'boolean') return ['equals']
  const ordered =
    !column.enum &&
    (kind === 'number' || kind === 'datetime' || column.format === 'isoDate')
  return ['equals', 'in', ...(ordered ? ['gt', 'gte', 'lt', 'lte'] : [])]
}

const IMAGE_EXTENSIONS: Record<CrudImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

/** Where the files of an image field are stored in its bucket. */
export const imagePrefix = (collection: string, field: string) =>
  `crud/${collection}/${field}/`

export const imageExtensions = (accept: CrudImageType[]) =>
  Object.fromEntries(accept.map((type) => [type, IMAGE_EXTENSIONS[type]]))

/** A key the upload function of this field could have built, and no other. */
export const imageKeySchema = (
  collection: string,
  field: string,
  accept: CrudImageType[]
): string => {
  const prefix = imagePrefix(collection, field).replaceAll('/', '\\/')
  const extensions = Object.values(imageExtensions(accept)).join('|')
  return `z.string().regex(/^${prefix}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${extensions})$/)`
}

export const searchSchema = `z.string().max(200)${NO_NUL}`

/** A record's id as a caller sends it. */
export const idSchema = (column: CrudColumn): string => {
  if (column.family === 'uuid') return `z.string().regex(${UUID})`
  if (column.family === 'integer') return INTEGER
  if (column.family === 'bigint') return BIGINT
  return `z.string().min(1).max(${column.maxLength ?? 255})${NO_NUL}`
}
