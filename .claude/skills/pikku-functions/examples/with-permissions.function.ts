import { pikkuFunc } from '#pikku/pikku-types.gen.js'
import { ForbiddenError } from '@pikku/core/errors'
import { requireOwner, requireAdmin } from '../permissions.js'
import type { Card } from '../types.js'

/**
 * Function with multiple permissions
 * Permissions are attached as properties, not called inside the function
 */
export const updateCard = pikkuFunc<
  { cardId: string; title?: string; description?: string },
  Card
>({
  expose: true,
  docs: {
    summary: 'Update a card',
    description: 'Updates card properties. Requires ownership or admin access.',
    tags: ['cards', 'update'],
    errors: ['NotFoundError', 'ForbiddenError'],
  },
  // ✅ CORRECT: Permissions attached as function properties
  // These are evaluated BEFORE the function runs
  permissions: {
    owner: requireOwner,
    admin: requireAdmin,
  },
  // ✅ CORRECT: Services destructured in parameter list
  func: async ({ store }, { cardId, title, description }) => {
    // No need to check permissions here - they're already enforced
    const card = await store.updateCard(cardId, { title, description })
    return card
  },
})
