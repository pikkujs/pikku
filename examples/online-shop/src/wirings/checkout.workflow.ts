import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'
import { wireHTTP } from '#pikku/http'
import { randomUUID } from 'node:crypto'

type ShippingAddress = {
  line1: string
  city: string
  postcode: string
  country: string
}

// @snippet start workflowSteps
// Every step of a DSL workflow is an ordinary pikku function. That is what
// makes a step retryable on its own, replayable from the durable log, and
// visible as a node in the generated workflow graph.
export const validateBasket = pikkuSessionlessFunc({
  description: 'Confirm the basket has items and enough stock to sell.',
  func: async ({ kysely }, { basketId }: { basketId: string }) => {
    const rows = await kysely
      .selectFrom('basketItem')
      .innerJoin('item', 'item.itemId', 'basketItem.itemId')
      .select([
        'basketItem.itemId',
        'basketItem.quantity',
        'item.stock',
        'item.name',
        'item.priceCents',
      ])
      .where('basketItem.basketId', '=', basketId)
      .execute()

    if (rows.length === 0) throw new Error('Basket is empty')
    for (const i of rows) {
      if (i.quantity > i.stock)
        throw new Error(`Insufficient stock for "${i.name}"`)
    }

    return {
      items: rows.map((i) => ({
        itemId: i.itemId,
        quantity: i.quantity,
        priceCents: i.priceCents,
      })),
      totalCents: rows.reduce((s, i) => s + i.priceCents * i.quantity, 0),
    }
  },
})
// @snippet end workflowSteps

export const createOrderRecord = pikkuSessionlessFunc({
  description: 'Persist the order and its line items.',
  func: async (
    { kysely },
    data: {
      userId: string
      totalCents: number
      shippingAddress: ShippingAddress
      items: Array<{ itemId: string; quantity: number; priceCents: number }>
    }
  ) => {
    const orderId = randomUUID()
    const now = new Date().toISOString()

    await kysely
      .insertInto('order')
      .values({
        orderId,
        userId: data.userId,
        status: 'pending',
        totalCents: data.totalCents,
        shippingAddress: JSON.stringify(data.shippingAddress),
        createdAt: now,
        updatedAt: now,
      })
      .execute()

    await kysely
      .insertInto('orderItem')
      .values(
        data.items.map((i) => ({
          orderItemId: randomUUID(),
          orderId,
          itemId: i.itemId,
          quantity: i.quantity,
          unitPriceCents: i.priceCents,
        }))
      )
      .execute()

    return { orderId }
  },
})

// @snippet start shopSecretUsage
// Note what is *absent* here: `secrets`.
//
// Every function-, permission- and auth-facing services type in pikku is
// bounded by `SecretlessServices`, which omits `secrets` outright. A function
// cannot read one, so a secret cannot leak through a return value, a log line
// or an error thrown from business logic — the class of bug you only find in
// somebody else's incident report.
//
// Secrets are read once, where they are needed. `chargeCard` asks the Stripe
// addon to create a payment intent; `STRIPE_SECRET_KEY` is the addon's secret
// and never crosses into this function, so it cannot be logged here, returned
// here, or attached to an error thrown here.
//
// This is the step the checkout workflow actually runs. The point used to be
// made by a second, unwired copy of the same call that existed only to be
// quoted — so the documented example was the one piece of payment code no
// shopper ever reached.
export const chargeCard = pikkuSessionlessFunc({
  // Invoked by name from `createOrder` as well as by the workflow, so one
  // charge path exists rather than two that can drift.
  expose: true,
  description: 'Charge the card through Stripe.',
  func: async (
    { logger },
    data: { orderId: string; totalCents: number; cardToken?: string },
    { rpc }
  ) => {
    // The order id goes in the payment intent's metadata because that is the
    // only way it comes back: `applyStripeEvent` reads it off the verified
    // webhook event to decide which order was paid. Stripe knows nothing about
    // our ids otherwise.
    const intent = await rpc.invoke('stripe:paymentIntentCreate', {
      amount: data.totalCents,
      currency: 'gbp',
      ...(data.cardToken
        ? { paymentMethod: data.cardToken, confirm: true }
        : {}),
      metadata: { orderId: data.orderId },
      // Charging twice for one order is the expensive failure here, and a
      // workflow step is retried by design.
      idempotencyKey: `order_${data.orderId}`,
      description: `Order ${data.orderId}`,
    })

    logger.info({
      event: 'payment_intent_created',
      orderId: data.orderId,
      status: intent.status,
    })

    return intent.status === 'succeeded'
      ? { status: 'succeeded' as const, providerRef: intent.id }
      : { status: 'failed' as const, reason: intent.status }
  },
})
// @snippet end shopSecretUsage

// @snippet start queuePublish
// Publishing to a queue: `queueService.add(name, payload)`, typed against the
// queue's declared payload shape.
//
// This is the step that actually sends a receipt. The example used to be
// `placeOrder`, which inserted an order with a zero total and an empty address
// purely to have something to queue about, and which nothing ever called.
export const finalizeOrder = pikkuSessionlessFunc({
  description:
    'Record the outcome, and on success clear the basket and queue the receipt.',
  func: async (
    { kysely, queueService },
    data: {
      orderId: string
      basketId: string
      userId: string
      status: 'paid' | 'payment_failed'
    }
  ) => {
    await kysely
      .updateTable('order')
      .set({ status: data.status, updatedAt: new Date().toISOString() })
      .where('orderId', '=', data.orderId)
      .execute()

    if (data.status === 'paid') {
      await kysely
        .deleteFrom('basketItem')
        .where('basketId', '=', data.basketId)
        .execute()
      await queueService?.add('send-order-confirmation', {
        orderId: data.orderId,
        userId: data.userId,
      })
    }
  },
})
// @snippet end queuePublish

// @snippet start checkoutWorkflow
// @snippet start wireWorkflow
// The workflow body is the plan, not the work: each `workflow.do` names a step
// and the function that performs it. Pikku records every step in a durable log,
// so a crash mid-payment resumes at the step that failed rather than charging
// the card twice.
export const checkoutWorkflow = pikkuWorkflowFunc<
  {
    basketId: string
    userId: string
    shippingAddress: ShippingAddress
    cardToken?: string
  },
  { orderId: string; status: 'paid' | 'payment_failed'; totalCents: number }
>({
  expose: true,
  func: async (_services, data, { workflow }) => {
    const basket = await workflow.do('Validate basket', 'validateBasket', {
      basketId: data.basketId,
    })

    const order = await workflow.do('Create order', 'createOrderRecord', {
      userId: data.userId,
      totalCents: basket.totalCents,
      shippingAddress: data.shippingAddress,
      items: basket.items,
    })

    // Safely retried if the payment provider times out.
    const payment = await workflow.do('Process payment', 'chargeCard', {
      orderId: order.orderId,
      totalCents: basket.totalCents,
      cardToken: data.cardToken,
    })

    const status =
      payment.status === 'succeeded'
        ? ('paid' as const)
        : ('payment_failed' as const)

    await workflow.do('Finalize', 'finalizeOrder', {
      orderId: order.orderId,
      basketId: data.basketId,
      userId: data.userId,
      status,
    })

    return { orderId: order.orderId, status, totalCents: basket.totalCents }
  },
})
// @snippet end wireWorkflow
// @snippet end checkoutWorkflow

// @snippet start workflowHTTPWiring
// Expose the checkout workflow via HTTP. rpc.startWorkflow() returns a runId
// immediately — the workflow runs async in the background.
// Pikku also auto-generates /workflow/:name/start and /workflow/:name/status/:id routes.
export const startCheckout = pikkuFunc({
  // Exposed like every other entry point. Without this the checkout is
  // reachable over HTTP and by nothing else — no scenario, no agent, no
  // internal caller — which is how eight workflow steps went untested.
  expose: true,
  func: async (
    {},
    {
      basketId,
      userId,
      shippingAddress,
      cardToken,
    }: {
      basketId: string
      userId: string
      shippingAddress: ShippingAddress
      cardToken?: string
    },
    { rpc }
  ) => {
    return rpc.startWorkflow('checkoutWorkflow', {
      basketId,
      userId,
      shippingAddress,
      cardToken,
    })
  },
})

wireHTTP({
  method: 'post',
  route: '/checkout',
  func: startCheckout,
  auth: true,
})
// @snippet end workflowHTTPWiring

export const checkOrderRefundable = pikkuSessionlessFunc({
  description: 'Report whether an order is in a state that can be refunded.',
  func: async ({ kysely }, { orderId }: { orderId: string }) => {
    const order = await kysely
      .selectFrom('order')
      .select(['status', 'totalCents'])
      .where('orderId', '=', orderId)
      .executeTakeFirst()
    return {
      eligible: order?.status === 'paid',
      totalCents: order?.totalCents ?? 0,
    }
  },
})

export const issueRefund = pikkuSessionlessFunc({
  description: 'Mark an order refunded.',
  func: async ({ kysely }, { orderId }: { orderId: string }) => {
    await kysely
      .updateTable('order')
      .set({ status: 'refunded', updatedAt: new Date().toISOString() })
      .where('orderId', '=', orderId)
      .execute()
  },
})

// @snippet start workflowPatterns
// A refund workflow demonstrating conditional branching and a built-in sleep step.
/**
 * The way in to the refund workflow.
 *
 * A workflow cannot be invoked over RPC — `workflow.do` is undefined outside a
 * workflow run — so a complete refund path sat here with `checkOrderRefundable`
 * and `issueRefund` behind it and nothing able to start any of it. Same shape as
 * `startCheckout`: a plain function whose whole job is `rpc.startWorkflow`.
 */
export const startRefund = pikkuFunc({
  expose: true,
  description: 'Start the refund workflow for an order.',
  // `orders:refund` is already declared and already granted to support staff —
  // it was simply never demanded by anything.
  scopes: ['orders:refund'],
  func: async (
    {},
    { orderId, reason }: { orderId: string; reason: string },
    { rpc }
  ) => {
    return rpc.startWorkflow('refundWorkflow', { orderId, reason })
  },
})

export const refundWorkflow = pikkuWorkflowFunc<
  { orderId: string; reason: string },
  { orderId: string; refunded: boolean; message: string }
>({
  func: async (_services, data, { workflow }) => {
    // @snippet start workflowBranching
    const check = await workflow.do('Check order', 'checkOrderRefundable', {
      orderId: data.orderId,
    })

    if (!check.eligible) {
      return {
        orderId: data.orderId,
        refunded: false,
        message: 'Order is not eligible for a refund.',
      }
    }

    // Hold for a cooling-off period before issuing the refund
    await workflow.sleep('Cooling-off delay', '5s')

    await workflow.do('Issue refund', 'issueRefund', { orderId: data.orderId })
    // @snippet end workflowBranching

    return {
      orderId: data.orderId,
      refunded: true,
      message: `Refunded ${(check.totalCents / 100).toFixed(2)} — reason: ${data.reason}`,
    }
  },
})
// @snippet end workflowPatterns

wireHTTP({
  method: 'post',
  route: '/orders/:orderId/refund',
  func: startRefund,
  auth: true,
})
