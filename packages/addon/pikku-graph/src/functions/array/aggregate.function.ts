import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const AggregateInput = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()))
    .describe('The array of items to aggregate'),
  field: z.string().describe('The field path to collect values from'),
  outputField: z
    .string()
    .optional()
    .describe('The name of the output field containing the list'),
  unique: z.boolean().optional().describe('Only include unique values'),
})

export const AggregateOutput = z.object({
  item: z
    .record(z.string(), z.unknown())
    .describe('The output object with aggregated values'),
})

type Output = z.infer<typeof AggregateOutput>

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

export const aggregate = pikkuSessionlessFunc({
  description: 'Combine a field from many items into a list in a single item',
  node: { displayName: 'Aggregate', category: 'Array', type: 'action' },
  input: AggregateInput,
  output: AggregateOutput,
  func: async (_services, data) => {
    const outputField = data.outputField ?? 'aggregated'
    const unique = data.unique ?? false
    let values = data.items.map((item) => getNestedValue(item, data.field))

    if (unique) {
      const seen = new Set<string>()
      values = values.filter((v) => {
        const key = JSON.stringify(v)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }

    return { item: { [outputField]: values } }
  },
})
