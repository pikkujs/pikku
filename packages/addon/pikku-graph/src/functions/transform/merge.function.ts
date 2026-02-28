import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const MergeInput = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()))
    .describe('Objects to merge (later objects override earlier ones)'),
  deep: z.boolean().optional().describe('Perform deep merge of nested objects'),
})

export const MergeOutput = z.object({
  item: z.record(z.string(), z.unknown()).describe('The merged object'),
})

type Output = z.infer<typeof MergeOutput>

const deepMerge = (
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> => {
  const result = { ...target }

  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      key in result &&
      result[key] !== null &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      )
    } else {
      result[key] = value
    }
  }

  return result
}

export const merge = pikkuSessionlessFunc({
  description: 'Merge multiple objects into one',
  node: { displayName: 'Merge', category: 'Transform', type: 'action' },
  input: MergeInput,
  output: MergeOutput,
  func: async (_services, data) => {
    const deep = data.deep ?? false

    if (data.items.length === 0) {
      return { item: {} }
    }

    let result = { ...data.items[0] }

    for (let i = 1; i < data.items.length; i++) {
      if (deep) {
        result = deepMerge(result, data.items[i])
      } else {
        result = { ...result, ...data.items[i] }
      }
    }

    return { item: result }
  },
})
