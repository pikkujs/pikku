import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const UniqueInput = z.object({
  items: z.array(z.unknown()).describe('The array to get unique values from'),
  field: z
    .string()
    .optional()
    .describe('For arrays of objects, the field to check uniqueness by'),
})

export const UniqueOutput = z.object({
  items: z.array(z.unknown()).describe('Array with only unique values'),
})

type Output = z.infer<typeof UniqueOutput>

const getNestedValue = (obj: unknown, path: string): unknown => {
  if (obj === null || typeof obj !== 'object') return obj
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export const unique = pikkuSessionlessFunc({
  description: 'Get unique values from an array',
  node: { displayName: 'Unique', category: 'Array', type: 'action' },
  input: UniqueInput,
  output: UniqueOutput,
  func: async (_services, data) => {
    const seen = new Set<string>()
    const items: unknown[] = []

    for (const item of data.items) {
      const value = data.field ? getNestedValue(item, data.field) : item
      const key = JSON.stringify(value)

      if (!seen.has(key)) {
        seen.add(key)
        items.push(item)
      }
    }

    return { items }
  },
})
