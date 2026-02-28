import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

const SortFieldSchema = z.object({
  field: z
    .string()
    .describe('The field path to sort by (supports dot notation)'),
  order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
})

export const SortInput = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()))
    .describe('The array of items to sort'),
  sortBy: z
    .array(SortFieldSchema)
    .describe('Fields to sort by (in order of priority)'),
})

export const SortOutput = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()))
    .describe('The sorted array of items'),
})

type Output = z.infer<typeof SortOutput>

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

const compare = (a: unknown, b: unknown, order: 'asc' | 'desc'): number => {
  if (a === b) return 0
  if (a === null || a === undefined) return order === 'asc' ? 1 : -1
  if (b === null || b === undefined) return order === 'asc' ? -1 : 1

  let result: number
  if (typeof a === 'number' && typeof b === 'number') {
    result = a - b
  } else if (typeof a === 'string' && typeof b === 'string') {
    result = a.localeCompare(b)
  } else if (a instanceof Date && b instanceof Date) {
    result = a.getTime() - b.getTime()
  } else {
    result = String(a).localeCompare(String(b))
  }

  return order === 'desc' ? -result : result
}

export const sort = pikkuSessionlessFunc({
  description: 'Change items order',
  node: { displayName: 'Sort', category: 'Array', type: 'action' },
  input: SortInput,
  output: SortOutput,
  func: async (_services, data) => {
    const sorted = [...data.items].sort((a, b) => {
      for (const sortField of data.sortBy) {
        const order = sortField.order ?? 'asc'
        const aVal = getNestedValue(a, sortField.field)
        const bVal = getNestedValue(b, sortField.field)
        const result = compare(aVal, bVal, order)
        if (result !== 0) return result
      }
      return 0
    })

    return { items: sorted }
  },
})
