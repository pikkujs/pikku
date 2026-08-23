import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const GetOrderInput = z.object({ orderId: z.string() })

export const GetOrderOutput = z.object({
  orderId: z.string(),
  status: z.string(),
  totalCents: z.number(),
  shippingAddress: z.record(z.string(), z.unknown()),
  items: z.array(
    z.object({
      itemId: z.string(),
      name: z.string(),
      quantity: z.number(),
      unitPriceCents: z.number(),
      lineTotalCents: z.number(),
    })
  ),
  createdAt: z.string(),
})

// @snippet start getOrder
// @snippet start funcThreeParams
// Three parameters, always: services, data, wire.
//   services — your toolbox (db, logger, queues)
//   data     — the typed input, wherever it arrived from
//   wire     — the protocol context (session, http, channel, rpc)
export const getOrder = pikkuFunc({
  expose: true,
  description: 'Get a single order. Users can only access their own orders.',
  input: GetOrderInput,
  output: GetOrderOutput,
  func: async ({ kysely }, { orderId }, { session }) => {
    const order = await kysely
      .selectFrom('order')
      .selectAll()
      .where('orderId', '=', orderId)
      .executeTakeFirst()

    if (!order) throw new Error('Order not found')
    if (order.userId !== session.userId && session.role !== 'admin') {
      throw new Error('Forbidden')
    }

    const items = await kysely
      .selectFrom('orderItem')
      .innerJoin('item', 'item.itemId', 'orderItem.itemId')
      .select([
        'orderItem.itemId',
        'item.name',
        'orderItem.quantity',
        'orderItem.unitPriceCents',
      ])
      .where('orderItem.orderId', '=', orderId)
      .execute()

    return {
      orderId: order.orderId,
      status: order.status,
      totalCents: order.totalCents,
      // Nullable: a walk-through order placed before an address was captured
      // has none, and returning null beats throwing on a read.
      shippingAddress: order.shippingAddress
        ? JSON.parse(order.shippingAddress)
        : null,
      items: items.map((i) => ({
        ...i,
        lineTotalCents: i.unitPriceCents * i.quantity,
      })),
      createdAt: order.createdAt,
    }
  },
})
// @snippet end funcThreeParams
// @snippet end getOrder
