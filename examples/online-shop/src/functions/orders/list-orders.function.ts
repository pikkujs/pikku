import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const ListOrdersInput = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
})

// @snippet start listOrders
export const listOrders = pikkuFunc({
  expose: true,
  description: 'List orders for the current user.',
  input: ListOrdersInput,
  func: async ({ kysely }, { limit, offset }, { session }) => {
    return kysely
      .selectFrom('order')
      .select(['orderId', 'status', 'totalCents', 'createdAt'])
      .where('userId', '=', session.userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()
  },
})
// @snippet end listOrders
