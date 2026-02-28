import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const PickInput = z.object({
  item: z.record(z.string(), z.unknown()).describe('The input object'),
  fields: z
    .array(z.string())
    .describe('Fields to keep (supports dot notation for nested fields)'),
})

export const PickOutput = z.object({
  item: z
    .record(z.string(), z.unknown())
    .describe('Object with only the specified fields'),
})

type Output = z.infer<typeof PickOutput>

const getNestedValue = (
  obj: Record<string, unknown>,
  path: string
): unknown => {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

const setNestedValue = (
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void => {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current)) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[keys[keys.length - 1]] = value
}

export const pick = pikkuSessionlessFunc({
  description: 'Keep only specified fields from an object',
  node: { displayName: 'Pick', category: 'Transform', type: 'action' },
  input: PickInput,
  output: PickOutput,
  func: async (_services, data) => {
    const result: Record<string, unknown> = {}

    for (const field of data.fields) {
      const value = getNestedValue(data.item, field)
      if (value !== undefined) {
        setNestedValue(result, field, value)
      }
    }

    return { item: result }
  },
})
