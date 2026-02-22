export function parseJson(val: unknown): any {
  if (val == null) return undefined
  if (typeof val === 'string') return JSON.parse(val)
  return val
}
