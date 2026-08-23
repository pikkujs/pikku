import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const ListItemsInput = z.object({
  categorySlug: z.string().optional(),
  search: z.string().optional(),
  // Paging is optional for callers; the defaults are applied in the function so
  // the generated input type stays `limit?: number` rather than a required key.
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})

export const ListItemsOutput = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      name: z.string(),
      slug: z.string(),
      description: z.string().nullable(),
      priceCents: z.number(),
      stock: z.number(),
      imageUrl: z.string().nullable(),
      category: z.object({
        categoryId: z.string(),
        name: z.string(),
        slug: z.string(),
      }),
    })
  ),
  total: z.number(),
})

// @snippet start listItems
// @snippet start readFunction
export const listItems = pikkuSessionlessFunc({
  expose: true,
  description: 'List items, optionally filtered by category or search query.',
  input: ListItemsInput,
  output: ListItemsOutput,
  func: async (
    { kysely },
    { categorySlug, search, limit = 20, offset = 0 }
  ) => {
    let query = kysely
      .selectFrom('item')
      .innerJoin('category', 'category.categoryId', 'item.categoryId')
      .select([
        'item.itemId',
        'item.name',
        'item.slug',
        'item.description',
        'item.priceCents',
        'item.stock',
        'item.imageUrl',
        'category.categoryId',
        'category.name as categoryName',
        'category.slug as categorySlug',
      ])
      .where('item.isActive', '=', 1)

    if (categorySlug) {
      query = query.where('category.slug', '=', categorySlug)
    }
    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('item.name', 'like', `%${search}%`),
          eb('item.description', 'like', `%${search}%`),
        ])
      )
    }

    const [rows, countRow] = await Promise.all([
      query.limit(limit).offset(offset).execute(),
      query
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirst(),
    ])

    return {
      items: rows.map((r) => ({
        itemId: r.itemId,
        name: r.name,
        slug: r.slug,
        description: r.description,
        priceCents: r.priceCents,
        stock: r.stock,
        imageUrl: r.imageUrl,
        category: {
          categoryId: r.categoryId,
          name: r.categoryName,
          slug: r.categorySlug,
        },
      })),
      total: Number(countRow?.count ?? 0),
    }
  },
})
// @snippet end readFunction
// @snippet end listItems
