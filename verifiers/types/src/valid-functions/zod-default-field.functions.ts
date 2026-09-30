/**
 * A Zod input whose field carries a `.default()`, for checking that the
 * generated type agrees with the JSON Schema about which fields a caller must pass.
 */

import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const ListPageInput = z.object({
  query: z.string(),
  limit: z.number().int().min(1).default(20),
})

export const ListPageOutput = z.object({
  limit: z.number(),
})

export const listPageRPC = pikkuSessionlessFunc({
  expose: true,
  auth: false,
  input: ListPageInput,
  output: ListPageOutput,
  func: async (_services, { limit }) => {
    return { limit: limit ?? 20 }
  },
})
