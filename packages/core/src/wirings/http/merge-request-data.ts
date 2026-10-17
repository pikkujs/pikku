import { UnprocessableContentError } from '../../errors/errors.js'

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Merges route params, query and body into the single input object a Pikku
 * function receives. Earlier parts win; a key present in more than one part
 * must carry an equivalent value (`'1'` and `1`, `'true'` and `true`), or the
 * request is rejected. Prototype-polluting keys are dropped.
 *
 * Every HTTP runtime calls this from `PikkuHTTPRequest.data()`, so the merge
 * and the conflict rule are identical wherever a function is served.
 *
 * @throws UnprocessableContentError when two parts disagree on a key.
 */
export const mergeRequestData = <In = unknown>(
  ...parts: Array<Readonly<Record<string, unknown>>>
): In => {
  const merged: Record<string, unknown> = {}
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (FORBIDDEN_KEYS.has(key)) {
        continue
      }
      if (key in merged && !valuesAreEquivalent(merged[key], value)) {
        throw new UnprocessableContentError(
          `Conflicting values for key "${key}": "${String(merged[key])}" vs "${String(value)}"`
        )
      }
      merged[key] ??= value
    }
  }
  return merged as In
}

const valuesAreEquivalent = (a: unknown, b: unknown): boolean =>
  coerce(a) === coerce(b)

const coerce = (value: unknown): unknown => {
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
    const num = Number(value)
    return isNaN(num) ? value : num
  }
  return value
}
