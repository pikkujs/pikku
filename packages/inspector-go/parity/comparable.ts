/**
 * Turns an inspector state into plain data that deep-equality can judge:
 * Maps and Sets become tagged arrays, class instances (TypesMap) their own
 * fields, and undefined members disappear, as they would through JSON.
 */
export const toPlain = (value: unknown): unknown => {
  if (value instanceof Map) {
    return {
      __map: [...value.entries()].map(([k, v]) => [toPlain(k), toPlain(v)]),
    }
  }
  if (value instanceof Set) {
    return { __set: [...value].map((v) => toPlain(v)) }
  }
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : toPlain(v)))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, member] of Object.entries(value)) {
      if (member === undefined) continue
      out[key] = toPlain(member)
    }
    return out
  }
  return value
}

/** Top-level fields no second engine can reproduce: live TS objects and timings. */
export const ENGINE_LOCAL_FIELDS: ReadonlySet<string> = new Set([
  'typesLookup',
  'program',
  'stats',
])

export const comparableState = (state: object): unknown =>
  toPlain(
    Object.fromEntries(
      Object.entries(state).filter(([key]) => !ENGINE_LOCAL_FIELDS.has(key))
    )
  )

/** The paths at which two plain values differ, up to `limit` of them. */
export const diffPaths = (
  a: unknown,
  b: unknown,
  limit = 20,
  path = '$',
  out: string[] = []
): string[] => {
  if (out.length >= limit) return out
  if (Object.is(a, b)) return out
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    out.push(
      `${path}: ${JSON.stringify(a)?.slice(0, 160)} != ${JSON.stringify(b)?.slice(0, 160)}`
    )
    return out
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    diffPaths(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      limit,
      `${path}.${key}`,
      out
    )
  }
  return out
}
