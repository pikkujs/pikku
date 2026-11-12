import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../.pikku/addon/function/index.js'

export const HealthScreenInput = z.object({
  projectKey: z.string(),
  stage: z.string().nullable(),
})
export const HealthScreenOutput = z.object({
  verdict: z.object({
    variant: z.enum(['wrong', 'fine']),
    values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    figures: z.array(
      z.object({
        variant: z.enum(['fig_pending']),
        value: z
          .object({ n: z.number(), unit: z.enum(['count', 'ms', 'percent']) })
          .optional(),
      })
    ),
  }),
  pending: z.object({ count: z.number() }),
})

/** The source of the arranged health screen: data and variants, never words. */
export const healthScreen = pikkuSessionlessFunc({
  description: 'Returns the data the arranged health screen draws',
  input: HealthScreenInput,
  output: HealthScreenOutput,
  func: async () => ({
    verdict: {
      variant: 'fine' as const,
      values: { count: 0 },
      figures: [
        {
          variant: 'fig_pending' as const,
          value: { n: 3, unit: 'count' as const },
        },
      ],
    },
    pending: { count: 3 },
  }),
})
