/**
 * What an introspected column type holds. `array` and `interval` are families
 * no declared type accepts: they are recognised so they are not mistaken for
 * the element or the lookalike type.
 */
export type TypeFamily =
  | 'text'
  | 'integer'
  | 'bigint'
  | 'decimal'
  | 'bytea'
  | 'real'
  | 'boolean'
  | 'timestamp'
  | 'uuid'
  | 'json'
  | 'array'
  | 'interval'

/**
 * The family of an introspected type, or `undefined` when it is not one this
 * can judge. Takes the type as the introspector reports it, with or without the
 * underlying type name after it (`bigint int8`), and matches whole words, so
 * `interval` and `point` are not read as integers.
 */
export const typeFamilyOf = (type: string): TypeFamily | undefined => {
  const t = type
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .trim()
  if (/\barray\b|\[\]|(^|\s)_/.test(t)) return 'array'
  if (/\binterval\b/.test(t)) return 'interval'
  if (/\bbool(ean)?\b/.test(t)) return 'boolean'
  if (/\buuid\b/.test(t)) return 'uuid'
  if (/json/.test(t)) return 'json'
  if (/\b(bytea|blob|tinyblob|mediumblob|longblob|binary|varbinary)\b/.test(t))
    return 'bytea'
  if (/\b(bigint|int8|bigserial|serial8)\b/.test(t)) return 'bigint'
  if (
    /\b(tinyint|smallint|mediumint|int|integer|int2|int4|serial|serial2|serial4|smallserial)\b/.test(
      t
    )
  )
    return 'integer'
  if (/\b(numeric|decimal|money)\b/.test(t)) return 'decimal'
  if (/\b(real|float|float4|float8|double|double precision)\b/.test(t))
    return 'real'
  if (/timestamp|datetime|\bdate\b|\btime\b/.test(t)) return 'timestamp'
  if (/char|text|clob|user-defined|\bname\b/.test(t)) return 'text'
  return undefined
}
