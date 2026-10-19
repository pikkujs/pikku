import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const GetItemInput = z.object({ itemId: z.string() })

export const GetItemOutput = z.object({
  itemId: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  priceCents: z.number(),
  stock: z.number(),
  imageUrl: z.string().nullable(),
  isActive: z.number(),
  category: z.object({
    categoryId: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// @snippet start shopVersionedItem
export const GetItemOutputV1 = z.object({
  itemId: z.string(),
  name: z.string(),
  priceCents: z.number(),
})

export const getItemV1 = pikkuSessionlessFunc({
  expose: true,
  version: 1,
  input: GetItemInput,
  output: GetItemOutputV1,
  func: async ({ kysely }, { itemId }) => {
    const row = await kysely
      .selectFrom('item')
      .select(['itemId', 'name', 'priceCents'])
      .where('itemId', '=', itemId)
      .executeTakeFirstOrThrow()
    return row
  },
})

// v2 — adds stock and imageUrl to the response
export const getItemV2 = pikkuSessionlessFunc({
  expose: true,
  version: 2,
  input: GetItemInput,
  output: GetItemOutput,
  func: async ({ kysely }, { itemId }) => {
    const row = await kysely
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
        'item.isActive',
        'item.createdAt',
        'item.updatedAt',
        'category.categoryId',
        'category.name as categoryName',
        'category.slug as categorySlug',
      ])
      .where('item.itemId', '=', itemId)
      .executeTakeFirstOrThrow()
    return {
      ...row,
      category: {
        categoryId: row.categoryId,
        name: row.categoryName,
        slug: row.categorySlug,
      },
    }
  },
})
// @snippet end shopVersionedItem

// @snippet start getItem
export const getItem = pikkuSessionlessFunc({
  expose: true,
  description: 'Get a single item by ID.',
  input: GetItemInput,
  output: GetItemOutput,
  func: async ({ kysely }, { itemId }) => {
    const row = await kysely
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
        'item.isActive',
        'item.createdAt',
        'item.updatedAt',
        'category.categoryId',
        'category.name as categoryName',
        'category.slug as categorySlug',
      ])
      .where('item.itemId', '=', itemId)
      .executeTakeFirst()

    if (!row) throw new Error(`Item not found: ${itemId}`)

    return {
      ...row,
      category: {
        categoryId: row.categoryId,
        name: row.categoryName,
        slug: row.categorySlug,
      },
    }
  },
})
// @snippet end getItem
