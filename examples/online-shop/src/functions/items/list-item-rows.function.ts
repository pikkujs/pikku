import { pikkuListFunc } from '#pikku/function'

// @snippet start listFunction
export const listItemRows = pikkuListFunc<
  { categorySlug: string; inStock: boolean },
  { itemId: string; name: string; priceCents: number; stock: number }
>({
  expose: true,
  description: 'Catalogue rows in the standard list shape (rows + cursor).',
  func: async ({ kysely }, { limit, search }) => {
    let query = kysely
      .selectFrom('item')
      .innerJoin('category', 'category.categoryId', 'item.categoryId')
      .select(['item.itemId', 'item.name', 'item.priceCents', 'item.stock'])
      .where('item.isActive', '=', 1)

    if (search) query = query.where('item.name', 'like', `%${search}%`)

    const rows = await query.limit(limit ?? 20).execute()

    return { rows, nextCursor: null, totalCount: rows.length }
  },
})
// @snippet end listFunction
