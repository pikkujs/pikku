import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

const AggregationSchema = z.object({
  field: z.string().describe('The field path to aggregate'),
  operation: z
    .enum([
      'sum',
      'avg',
      'min',
      'max',
      'count',
      'countDistinct',
      'first',
      'last',
    ])
    .describe('The aggregation operation'),
  outputField: z.string().describe('The name of the output field'),
})

export const SummarizeInput = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()))
    .describe('The array of items to summarize'),
  aggregations: z
    .array(AggregationSchema)
    .describe('List of aggregation operations to perform'),
  groupBy: z.array(z.string()).optional().describe('Fields to group by'),
})

export const SummarizeOutput = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()))
    .describe('The summarized results'),
})

type Output = z.infer<typeof SummarizeOutput>

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

const computeAggregation = (values: unknown[], operation: string): unknown => {
  const numericValues = values.filter((v) => typeof v === 'number') as number[]

  switch (operation) {
    case 'sum':
      return numericValues.reduce((a, b) => a + b, 0)
    case 'avg':
      return numericValues.length > 0
        ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length
        : null
    case 'min':
      return numericValues.length > 0 ? Math.min(...numericValues) : null
    case 'max':
      return numericValues.length > 0 ? Math.max(...numericValues) : null
    case 'count':
      return values.length
    case 'countDistinct':
      return new Set(values.map((v) => JSON.stringify(v))).size
    case 'first':
      return values[0] ?? null
    case 'last':
      return values[values.length - 1] ?? null
    default:
      return null
  }
}

export const summarize = pikkuSessionlessFunc({
  description: 'Sum, count, max, etc. across items',
  node: { displayName: 'Summarize', category: 'Array', type: 'action' },
  input: SummarizeInput,
  output: SummarizeOutput,
  func: async (_services, data) => {
    const groupBy = data.groupBy ?? []

    if (groupBy.length === 0) {
      const result: Record<string, unknown> = {}
      for (const agg of data.aggregations) {
        const values = data.items.map((item) => getNestedValue(item, agg.field))
        result[agg.outputField] = computeAggregation(values, agg.operation)
      }
      return { items: [result] }
    }

    const groups = new Map<string, Record<string, unknown>[]>()
    for (const item of data.items) {
      const groupKey = JSON.stringify(
        groupBy.map((f) => getNestedValue(item, f))
      )
      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }
      groups.get(groupKey)!.push(item)
    }

    const results: Record<string, unknown>[] = []
    for (const [, groupItems] of groups) {
      const result: Record<string, unknown> = {}

      for (const field of groupBy) {
        result[field] = getNestedValue(groupItems[0], field)
      }

      for (const agg of data.aggregations) {
        const values = groupItems.map((item) => getNestedValue(item, agg.field))
        result[agg.outputField] = computeAggregation(values, agg.operation)
      }

      results.push(result)
    }

    return { items: results }
  },
})
