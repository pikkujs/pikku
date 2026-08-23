import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { pikkuFunc } from '#pikku/function'

export const CreateOrderInput = z.object({
  basketId: z.string(),
  shippingAddress: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    postcode: z.string(),
    country: z.string(),
  }),
  cardToken: z.string().optional(),
})

export const CreateOrderOutput = z.object({
  orderId: z.string(),
  status: z.string(),
  totalCents: z.number(),
})

// @snippet start createOrder
export const createOrder = pikkuFunc({
  expose: true,
  description:
    'Create an order from a basket and charge via the fake payment provider.',
  input: CreateOrderInput,
  output: CreateOrderOutput,
  func: async (
    { kysely, queueService, audit },
    { basketId, shippingAddress, cardToken },
    { session, rpc }
  ) => {
    const userId = session.userId

    // Load basket items with current prices
    const basketItems = await kysely
      .selectFrom('basketItem')
      .innerJoin('item', 'item.itemId', 'basketItem.itemId')
      .select([
        'basketItem.itemId',
        'basketItem.quantity',
        'item.priceCents',
        'item.stock',
        'item.name',
      ])
      .where('basketItem.basketId', '=', basketId)
      .execute()

    if (basketItems.length === 0) throw new Error('Basket is empty')

    // Validate stock
    for (const bi of basketItems) {
      if (bi.quantity > bi.stock)
        throw new Error(`Insufficient stock for "${bi.name}"`)
    }

    const totalCents = basketItems.reduce(
      (sum, bi) => sum + bi.priceCents * bi.quantity,
      0
    )
    const orderId = randomUUID()
    const now = new Date().toISOString()

    // Create order
    await kysely
      .insertInto('order')
      .values({
        orderId,
        userId,
        status: 'pending',
        totalCents,
        shippingAddress: JSON.stringify(shippingAddress),
        createdAt: now,
        updatedAt: now,
      })
      .execute()

    // Create order items
    await kysely
      .insertInto('orderItem')
      .values(
        basketItems.map((bi) => ({
          orderItemId: randomUUID(),
          orderId,
          itemId: bi.itemId,
          quantity: bi.quantity,
          unitPriceCents: bi.priceCents,
        }))
      )
      .execute()

    // Deduct stock
    for (const bi of basketItems) {
      await kysely
        .updateTable('item')
        .set({ stock: bi.stock - bi.quantity, updatedAt: now })
        .where('itemId', '=', bi.itemId)
        .execute()
    }

    // Process payment through Stripe, the same way the checkout workflow does.
    // Both used to call a fake service that succeeded unless the card token
    // ended in '0000', so neither path had ever met a payment provider.
    const paymentId = randomUUID()
    const paymentResult = await rpc.invoke('chargeCard', {
      orderId,
      totalCents,
      ...(cardToken ? { cardToken } : {}),
    })

    await kysely
      .insertInto('payment')
      .values({
        paymentId,
        orderId,
        amountCents: totalCents,
        provider: 'fake',
        status: paymentResult.status,
        providerRef:
          paymentResult.status === 'succeeded'
            ? paymentResult.providerRef
            : null,
        createdAt: now,
      })
      .execute()

    const orderStatus =
      paymentResult.status === 'succeeded' ? 'paid' : 'payment_failed'
    await kysely
      .updateTable('order')
      .set({ status: orderStatus, updatedAt: now })
      .where('orderId', '=', orderId)
      .execute()

    if (paymentResult.status === 'succeeded') {
      // Clear basket and enqueue confirmation email
      await kysely
        .deleteFrom('basketItem')
        .where('basketId', '=', basketId)
        .execute()
      await queueService.add('send-order-confirmation', { orderId, userId })
      // @snippet start auditDispatch
      await audit?.audit({
        type: 'order.created',
        source: 'explicit',
        occurredAt: new Date().toISOString(),
        metadata: { orderId, userId },
      })
      // @snippet end auditDispatch
    }

    return { orderId, status: orderStatus, totalCents }
  },
})
// @snippet end createOrder
