import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const GroupByInput = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()))
    .describe('The array of items to group'),
  field: z.string().describe('The field to group by (supports dot notation)'),
})

export const GroupByOutput = z.object({
  groups: z
    .record(z.string(), z.array(z.record(z.string(), z.unknown())))
    .describe('Object with group keys and their items'),
})

type Output = z.infer<typeof GroupByOutput>

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

export const groupBy = pikkuSessionlessFunc({
  description: 'Group items by a field value',
  node: { displayName: 'Group By', category: 'Array', type: 'action' },
  input: GroupByInput,
  output: GroupByOutput,
  func: async (_services, data) => {
    const groups: Record<string, Record<string, unknown>[]> = {}

    for (const item of data.items) {
      const value = getNestedValue(item, data.field)
      const key = String(value ?? 'undefined')

      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(item)
    }

    return { groups }
  },
})
