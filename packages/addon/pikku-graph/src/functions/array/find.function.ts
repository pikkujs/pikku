import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const FindInput = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()))
    .describe('The array to search'),
  field: z.string().describe('The field to match against'),
  value: z.unknown().describe('The value to find'),
  returnIndex: z
    .boolean()
    .optional()
    .describe('Return the index instead of the item'),
})

export const FindOutput = z.object({
  item: z
    .record(z.string(), z.unknown())
    .nullable()
    .describe('The found item (null if not found)'),
  index: z.number().describe('The index of the found item (-1 if not found)'),
  found: z.boolean().describe('Whether the item was found'),
})

type Output = z.infer<typeof FindOutput>

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

export const find = pikkuSessionlessFunc({
  description: 'Find the first item matching a field value',
  node: { displayName: 'Find', category: 'Array', type: 'action' },
  input: FindInput,
  output: FindOutput,
  func: async (_services, data) => {
    const targetStr = JSON.stringify(data.value)

    for (let i = 0; i < data.items.length; i++) {
      const itemValue = getNestedValue(data.items[i], data.field)
      if (JSON.stringify(itemValue) === targetStr) {
        return {
          item: data.items[i],
          index: i,
          found: true,
        }
      }
    }

    return {
      item: null,
      index: -1,
      found: false,
    }
  },
})
