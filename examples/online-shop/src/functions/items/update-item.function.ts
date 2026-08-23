import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const UpdateItemInput = z.object({
  itemId: z.string(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  priceCents: z.number().int().positive().optional(),
  stock: z.number().int().min(0).optional(),
  imageUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
})

// @snippet start updateItem
export const updateItem = pikkuFunc({
  expose: true,
  description: 'Update an item. Admin only.',
  // "Admin only" was a sentence in a description, not a rule. The route carried
  // `auth: true`, which means signed in — so any shopper with an account could
  // edit the catalogue. `catalogue:write` was already declared in scopes.ts and
  // already granted to the admin role; nothing was checking it.
  scopes: ['catalogue:write'],
  input: UpdateItemInput,
  func: async ({ kysely }, { itemId, ...patch }) => {
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    }
    if (patch.name !== undefined) updates.name = patch.name
    if (patch.description !== undefined) updates.description = patch.description
    if (patch.priceCents !== undefined) updates.priceCents = patch.priceCents
    if (patch.stock !== undefined) updates.stock = patch.stock
    if (patch.imageUrl !== undefined) updates.imageUrl = patch.imageUrl
    if (patch.isActive !== undefined) updates.isActive = patch.isActive ? 1 : 0

    await kysely
      .updateTable('item')
      .set(updates)
      .where('itemId', '=', itemId)
      .execute()
  },
})
// @snippet end updateItem
