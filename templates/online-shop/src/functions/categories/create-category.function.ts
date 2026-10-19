import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { pikkuFunc } from '#pikku/function'

export const CreateCategoryInput = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
})

export const CreateCategoryOutput = z.object({
  categoryId: z.string(),
  name: z.string(),
  slug: z.string(),
})

// @snippet start createCategory
export const createCategory = pikkuFunc({
  expose: true,
  description: 'Create a new product category. Admin only.',
  // "Admin only" was a sentence in a description, not a rule. The route carried
  // `auth: true`, which means signed in — so any shopper with an account could
  // edit the catalogue. `catalogue:write` was already declared in scopes.ts and
  // already granted to the admin role; nothing was checking it.
  scopes: ['catalogue:write'],
  input: CreateCategoryInput,
  output: CreateCategoryOutput,
  func: async ({ kysely }, { name, slug, description }) => {
    const categoryId = randomUUID()
    await kysely
      .insertInto('category')
      .values({ categoryId, name, slug, description: description ?? null })
      .execute()
    return { categoryId, name, slug }
  },
})
// @snippet end createCategory
