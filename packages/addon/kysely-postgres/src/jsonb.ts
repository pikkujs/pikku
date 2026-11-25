import { sql } from 'kysely'
import type { Expression, RawBuilder } from 'kysely'

/**
 * Binds already-serialized JSON text as a `jsonb` parameter.
 *
 * The value is carried as text and only then cast to jsonb, so it lands as a
 * JSON value and not as a JSON string that happens to contain JSON. The
 * intermediate `::text` is what makes that true for every driver: postgres.js
 * infers a parameter's type from the cast that follows it and JSON-encodes
 * anything it believes is jsonb, so a bare `$1::jsonb` would arrive
 * double-encoded — `1` stored as `"1"`, and a counter read back as a string.
 */
export const jsonbText = (json: string): RawBuilder<unknown> =>
  sql`(${json}::text)::jsonb`

/**
 * Binds a JavaScript value as a `jsonb` parameter, safely for every driver.
 *
 * `JSON.stringify` yields `undefined` rather than JSON text for `undefined`,
 * functions and symbols, which would otherwise reach the driver as a non-string
 * bind and fail far from the call that caused it.
 */
export const jsonbValue = (value: unknown): RawBuilder<unknown> => {
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new TypeError(
      `Cannot bind ${typeof value} as jsonb: it has no JSON representation.`
    )
  }
  return jsonbText(json)
}

/**
 * Merges a patch into a `jsonb` column, creating keys that are not already
 * present. `||` is used rather than `jsonb_set` because `jsonb_set` will not
 * create a key that is missing.
 *
 * Reach for this rather than hand-writing the merge: a patch bound directly
 * against `::jsonb` is appended as a JSON *string*, turning the column into a
 * two-element array instead of a merged object.
 */
export const jsonbMerge = (
  column: Expression<unknown>,
  patch: unknown
): RawBuilder<unknown> =>
  sql`coalesce(${column}, '{}'::jsonb) || ${jsonbValue(patch)}`
