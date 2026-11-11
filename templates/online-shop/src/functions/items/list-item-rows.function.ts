// @snippet start listFunction
import { pikkuListFunc } from '#pikku/function'

export const listItemRows = pikkuListFunc<
  { categorySlug: string; inStock: boolean },
  { itemId: string; name: string; priceCents: number; stock: number }
>({
  expose: true,
  description: 'Catalogue rows in the standard list shape (rows + cursor).',
  func: async ({ kysely }, { limit, cursor, search }) => {
    // `limit` comes from the caller, so cap it.
    const pageSize = Math.min(limit ?? 20, 100)
    // The cursor is whatever string the last page handed out; here, an offset.
    const offset = Number(cursor ?? 0)

    let query = kysely
      .selectFrom('item')
      .innerJoin('category', 'category.categoryId', 'item.categoryId')
      .select(['item.itemId', 'item.name', 'item.priceCents', 'item.stock'])
      .where('item.isActive', '=', 1)

    if (search) query = query.where('item.name', 'like', `%${search}%`)

    // One extra row says whether another page exists.
    const rows = await query
      .orderBy('item.itemId')
      .limit(pageSize + 1)
      .offset(offset)
      .execute()

    return {
      rows: rows.slice(0, pageSize),
      nextCursor: rows.length > pageSize ? String(offset + pageSize) : null,
    }
  },
})
// @snippet end listFunction
