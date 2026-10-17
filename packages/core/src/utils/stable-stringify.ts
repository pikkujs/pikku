/**
 * `JSON.stringify` with object keys sorted, so property order cannot change
 * the output. Follows `JSON.stringify` for everything else: `toJSON` is
 * honoured, object properties whose value JSON cannot represent (`undefined`,
 * functions, symbols) are omitted, the same values become `null` inside
 * arrays, and such a value at the top level returns `undefined`.
 *
 * Keys are emitted in plain string order, including integer-like keys that a
 * JavaScript object would otherwise move to the front.
 */
export const stableStringify = (value: unknown): string | undefined =>
  serialize(value, '')

const serialize = (value: unknown, key: string): string | undefined => {
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
  ) {
    value = (value as { toJSON: (key: string) => unknown }).toJSON(key)
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, i) => serialize(item, String(i)) ?? 'null').join(',')}]`
  }
  const record = value as Record<string, unknown>
  const entries: string[] = []
  for (const k of Object.keys(record).sort()) {
    const serialized = serialize(record[k], k)
    if (serialized !== undefined) {
      entries.push(`${JSON.stringify(k)}:${serialized}`)
    }
  }
  return `{${entries.join(',')}}`
}
