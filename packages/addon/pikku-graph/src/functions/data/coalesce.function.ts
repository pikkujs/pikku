import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const CoalesceInput = z.object({
  values: z.array(z.unknown()).describe('Values to check in order'),
  treatEmptyStringAsNull: z
    .boolean()
    .optional()
    .describe('Treat empty strings as null'),
  treatZeroAsNull: z.boolean().optional().describe('Treat zero as null'),
})

export const CoalesceOutput = z.object({
  value: z.unknown().describe('The first non-null value'),
  index: z.number().describe('Index of the returned value (-1 if all null)'),
})

type Output = z.infer<typeof CoalesceOutput>

export const coalesce = pikkuSessionlessFunc({
  description: 'Return the first non-null value',
  node: { displayName: 'Coalesce', category: 'Data', type: 'action' },
  input: CoalesceInput,
  output: CoalesceOutput,
  func: async (_services, data) => {
    const treatEmptyStringAsNull = data.treatEmptyStringAsNull ?? false
    const treatZeroAsNull = data.treatZeroAsNull ?? false

    for (let i = 0; i < data.values.length; i++) {
      const value = data.values[i]

      if (value === null || value === undefined) continue
      if (treatEmptyStringAsNull && value === '') continue
      if (treatZeroAsNull && value === 0) continue

      return { value, index: i }
    }

    return { value: null, index: -1 }
  },
})
