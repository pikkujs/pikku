import { pikkuPermission } from '#pikku/pikku-types.gen.js'

/**
 * Basic permission using pikkuPermission
 * Returns true if the user owns the resource
 */
export const requireOwner = pikkuPermission<{ resourceOwnerId: string }>(
  async ({ ownership }, data, session) => {
    if (!session?.userId) return false
    return ownership.isOwner(session.userId, data.resourceOwnerId)
  }
)

/**
 * Admin permission check
 */
export const requireAdmin = pikkuPermission(
  async ({ userService }, _data, session) => {
    if (!session?.userId) return false
    const user = await userService.getUser(session.userId)
    return user?.role === 'admin'
  }
)

/**
 * Complex permission with multiple checks
 */
export const canDeleteCard = pikkuPermission<{ cardId: string }>(
  async ({ store }, { cardId }, session) => {
    if (!session?.userId) return false

    const card = await store.getCard(cardId)
    if (!card) return false

    // User must be owner or admin
    return card.ownerId === session.userId || session.role === 'admin'
  }
)
