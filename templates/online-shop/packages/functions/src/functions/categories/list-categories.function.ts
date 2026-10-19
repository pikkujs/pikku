import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const ListCategoriesOutput = z.array(
  z.object({
    categoryId: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
  })
)

// @snippet start listCategories
export const listCategories = pikkuSessionlessFunc({
  expose: true,
  description: 'List all product categories.',
  output: ListCategoriesOutput,
  func: async ({ kysely }) => {
    return kysely
      .selectFrom('category')
      .select(['categoryId', 'name', 'slug', 'description'])
      .orderBy('name')
      .execute()
  },
})
// @snippet end listCategories
