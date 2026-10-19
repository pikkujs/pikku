import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { pikkuSessionlessFunc } from '#pikku/function'

export const AddToBasketInput = z.object({
  basketId: z.string(),
  itemId: z.string(),
  quantity: z.number().int().min(1).default(1),
})

// @snippet start addToBasket
// @snippet start writeFunction
export const addToBasket = pikkuSessionlessFunc({
  expose: true,
  description:
    'Add an item to a basket, or increase its quantity if already present.',
  input: AddToBasketInput,
  func: async ({ kysely }, { basketId, itemId, quantity }) => {
    const item = await kysely
      .selectFrom('item')
      .select(['stock', 'isActive'])
      .where('itemId', '=', itemId)
      .executeTakeFirst()

    if (!item || !item.isActive) throw new Error('Item not available')

    const existing = await kysely
      .selectFrom('basketItem')
      .select(['basketItemId', 'quantity'])
      .where('basketId', '=', basketId)
      .where('itemId', '=', itemId)
      .executeTakeFirst()

    if (existing) {
      const newQty = existing.quantity + quantity
      if (newQty > item.stock) throw new Error('Not enough stock')
      await kysely
        .updateTable('basketItem')
        .set({ quantity: newQty })
        .where('basketItemId', '=', existing.basketItemId)
        .execute()
    } else {
      if (quantity > item.stock) throw new Error('Not enough stock')
      await kysely
        .insertInto('basketItem')
        .values({ basketItemId: randomUUID(), basketId, itemId, quantity })
        .execute()
    }

    await kysely
      .updateTable('basket')
      .set({ updatedAt: new Date().toISOString() })
      .where('basketId', '=', basketId)
      .execute()
  },
})
// @snippet end writeFunction
// @snippet end addToBasket
