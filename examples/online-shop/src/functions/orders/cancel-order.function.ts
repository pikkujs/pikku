import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { isOrderOwner } from '../../wirings/shop.security.js'

export const CancelOrderInput = z.object({ orderId: z.string() })

// @snippet start cancelOrder
export const cancelOrder = pikkuFunc({
  expose: true,
  description: 'Cancel a pending order and restore stock.',
  input: CancelOrderInput,
  // Authorization is declared, not written. `scopes` is what the role
  // entitles the caller to and is AND-ed; `permissions` is what is true of
  // this particular row and is OR-ed across keys. Both run before the body,
  // so the function below only ever sees a caller who is allowed to be there.
  //
  // The `support` role holds `orders:cancel` without owning the order, so it
  // passes on the scope; a customer passes on ownership. Neither case needs a
  // branch in the body.
  scopes: ['orders:cancel'],
  permissions: {
    owner: isOrderOwner,
  },
  // `node` describes this function as a step someone can drop into a visual
  // flow: what to call it, where it files, and whether it starts a flow
  // ('trigger'), continues one ('action') or ends it ('end'). Without it the
  // function still works everywhere else — it just does not appear as a node.
  node: {
    displayName: 'Cancel Order',
    category: 'Orders',
    type: 'action',
  },
  func: async ({ kysely, queueService }, { orderId }, { session }) => {
    const order = await kysely
      .selectFrom('order')
      .select(['orderId', 'userId', 'status'])
      .where('orderId', '=', orderId)
      .executeTakeFirst()

    if (!order) throw new Error('Order not found')
    if (!['pending', 'paid'].includes(order.status)) {
      throw new Error(`Cannot cancel order in status: ${order.status}`)
    }

    // Restore stock
    const items = await kysely
      .selectFrom('orderItem')
      .select(['itemId', 'quantity'])
      .where('orderId', '=', orderId)
      .execute()

    const now = new Date().toISOString()
    for (const item of items) {
      await kysely
        .updateTable('item')
        .set((eb) => ({
          stock: eb('stock', '+', item.quantity),
          updatedAt: now,
        }))
        .where('itemId', '=', item.itemId)
        .execute()
    }

    await kysely
      .updateTable('order')
      .set({ status: 'cancelled', updatedAt: now })
      .where('orderId', '=', orderId)
      .execute()

    await queueService.add('audit-event', {
      entityType: 'order',
      entityId: orderId,
      action: 'cancelled',
      actorId: session.userId,
    })
  },
})
// @snippet end cancelOrder
