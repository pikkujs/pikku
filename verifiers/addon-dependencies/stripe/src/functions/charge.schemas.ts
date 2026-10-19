import { z } from 'zod'

export const ChargeInput = z.object({ amountCents: z.number().int() })
export const ChargeOutput = z.object({
  chargeId: z.string(),
  chargedCents: z.number(),
})
