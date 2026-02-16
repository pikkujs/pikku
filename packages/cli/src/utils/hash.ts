import { createHash } from 'crypto'

export function canonicalJSON(obj: unknown): string {
  return JSON.stringify(sortDeep(obj))
}

function sortDeep(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(sortDeep)
  }
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortDeep((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

export function hashString(input: string, length: number = 16): string {
  return createHash('sha256').update(input).digest('hex').slice(0, length)
}
