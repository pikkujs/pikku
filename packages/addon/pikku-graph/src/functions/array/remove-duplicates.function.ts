import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const RemoveDuplicatesInput = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()))
    .describe('The array of items to deduplicate'),
  fields: z
    .array(z.string())
    .describe(
      'Fields to use for comparison (if empty, compares entire objects)'
    ),
  keepFirst: z
    .boolean()
    .optional()
    .describe('Keep the first occurrence (true) or last (false)'),
})

export const RemoveDuplicatesOutput = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()))
    .describe('The deduplicated array of items'),
  removedCount: z.number().describe('Number of duplicates removed'),
})

type Output = z.infer<typeof RemoveDuplicatesOutput>

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

const getComparisonKey = (
  item: Record<string, unknown>,
  fields: string[]
): string => {
  if (fields.length === 0) {
    return JSON.stringify(item)
  }
  const values = fields.map((field) => getNestedValue(item, field))
  return JSON.stringify(values)
}

export const removeDuplicates = pikkuSessionlessFunc({
  description: 'Delete items with matching field values',
  node: { displayName: 'Remove Duplicates', category: 'Array', type: 'action' },
  input: RemoveDuplicatesInput,
  output: RemoveDuplicatesOutput,
  func: async (_services, data) => {
    const keepFirst = data.keepFirst ?? true
    const seen = new Map<string, Record<string, unknown>>()
    const originalCount = data.items.length

    for (const item of data.items) {
      const key = getComparisonKey(item, data.fields)
      if (keepFirst) {
        if (!seen.has(key)) {
          seen.set(key, item)
        }
      } else {
        seen.set(key, item)
      }
    }

    const items = Array.from(seen.values())
    return { items, removedCount: originalCount - items.length }
  },
})
