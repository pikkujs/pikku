import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { pikkuSessionlessFunc } from '#pikku/function'

export const GetBasketInput = z.object({
  sessionId: z.string().optional(),
})

export const BasketItemSchema = z.object({
  basketItemId: z.string(),
  itemId: z.string(),
  name: z.string(),
  slug: z.string(),
  priceCents: z.number(),
  imageUrl: z.string().nullable(),
  quantity: z.number(),
  lineTotalCents: z.number(),
})

export const GetBasketOutput = z.object({
  basketId: z.string(),
  items: z.array(BasketItemSchema),
  totalCents: z.number(),
  itemCount: z.number(),
})

// @snippet start getBasket
export const getBasket = pikkuSessionlessFunc({
  expose: true,
  description:
    'Get basket for the current user or session. Creates one if it does not exist.',
  input: GetBasketInput,
  output: GetBasketOutput,
  func: async ({ kysely }, { sessionId }, { session }) => {
    const userId = session?.userId ?? null
    const sid = sessionId ?? null

    // Find or create basket
    let basket = userId
      ? await kysely
          .selectFrom('basket')
          .selectAll()
          .where('userId', '=', userId)
          .executeTakeFirst()
      : sid
        ? await kysely
            .selectFrom('basket')
            .selectAll()
            .where('sessionId', '=', sid)
            .executeTakeFirst()
        : null

    if (!basket) {
      const basketId = randomUUID()
      const now = new Date().toISOString()
      await kysely
        .insertInto('basket')
        .values({
          basketId,
          userId,
          sessionId: sid,
          createdAt: now,
          updatedAt: now,
        })
        .execute()
      return { basketId, items: [], totalCents: 0, itemCount: 0 }
    }

    const rows = await kysely
      .selectFrom('basketItem')
      .innerJoin('item', 'item.itemId', 'basketItem.itemId')
      .select([
        'basketItem.basketItemId',
        'basketItem.itemId',
        'basketItem.quantity',
        'item.name',
        'item.slug',
        'item.priceCents',
        'item.imageUrl',
      ])
      .where('basketItem.basketId', '=', basket.basketId)
      .execute()

    const items = rows.map((r) => ({
      basketItemId: r.basketItemId,
      itemId: r.itemId,
      name: r.name,
      slug: r.slug,
      priceCents: r.priceCents,
      imageUrl: r.imageUrl,
      quantity: r.quantity,
      lineTotalCents: r.priceCents * r.quantity,
    }))

    return {
      basketId: basket.basketId,
      items,
      totalCents: items.reduce((sum, i) => sum + i.lineTotalCents, 0),
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    }
  },
})
// @snippet end getBasket
