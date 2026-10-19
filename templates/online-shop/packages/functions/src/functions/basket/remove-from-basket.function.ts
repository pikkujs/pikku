import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const RemoveFromBasketInput = z.object({
  basketId: z.string(),
  itemId: z.string(),
})

// @snippet start removeFromBasket
export const removeFromBasket = pikkuSessionlessFunc({
  expose: true,
  description: 'Remove an item from a basket entirely.',
  input: RemoveFromBasketInput,
  func: async ({ kysely }, { basketId, itemId }) => {
    await kysely
      .deleteFrom('basketItem')
      .where('basketId', '=', basketId)
      .where('itemId', '=', itemId)
      .execute()

    await kysely
      .updateTable('basket')
      .set({ updatedAt: new Date().toISOString() })
      .where('basketId', '=', basketId)
      .execute()
  },
})
// @snippet end removeFromBasket
