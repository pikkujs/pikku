/**
 * Every callable function this template owns, exercised once.
 *
 * The journey scenario proves a shopper can buy something. This one proves
 * nothing is *unreached* — the question that went unasked while
 * `checkoutWorkflow` sat with eight steps of payment, refund and finalisation
 * logic that no test ever ran.
 *
 * MCP tools are absent on purpose. Their names appear in the RPC type union, so
 * calling one compiles and then fails at runtime with RPCNotFoundError, because
 * the runtime serves only `expose: true`. They wrap functions called directly
 * here, so nothing is lost.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const everyFunctionRuns = pikkuScenario<void, { checked: number }>({
  title: 'Every callable function runs',
  description:
    'Invokes each callable function once, so an uncallable one fails loudly',
  tags: ['scenario', 'coverage'],
  func: async ({ logger }, _data, { scenario, actors }) => {
    if (!actors?.alex) {
      throw new Error(
        'needs the `alex` actor (admin) — run via `pikku scenario run <environment>`'
      )
    }
    const admin = actors.alex
    const shopper = actors.shopper ?? actors.alex

    const session = await scenario.do(
      'reads the session',
      'getSession',
      {},
      { actor: admin }
    )

    // A unique suffix per run: this scenario executes once per surface, and the
    // second pass collided on the catalogue's unique slug index. The session id
    // is stable across both passes, so it has to be the clock.
    const stamp = String(Date.now()).slice(-8)

    const category = await scenario.do(
      'creates a category',
      'createCategory',
      {
        name: `Coverage ${stamp}`,
        slug: `coverage-${stamp}`,
        description: 'Probe',
      },
      { actor: admin }
    )

    const item = await scenario.do(
      'adds an item',
      'createItem',
      {
        categoryId: category.categoryId,
        name: 'Coverage probe mug',
        slug: `coverage-probe-mug-${stamp}`,
        priceCents: 1200,
        stock: 5,
      },
      { actor: admin }
    )

    await scenario.do(
      'edits it',
      'updateItem',
      { itemId: item.itemId, stock: 9 },
      { actor: admin }
    )

    await scenario.do('lists categories', 'listCategories', null, {
      actor: shopper,
    })
    await scenario.do(
      'checks availability',
      'checkItemAvailability',
      { itemId: item.itemId },
      { actor: shopper }
    )

    const basket = await scenario.do(
      'opens a basket',
      'getBasket',
      {},
      { actor: shopper }
    )
    await scenario.do(
      'fills it',
      'addToBasket',
      { basketId: basket.basketId, itemId: item.itemId, quantity: 1 },
      { actor: shopper }
    )

    // Through the starter, not the workflow: a workflow invoked over plain RPC
    // gets no workflow context. This is the first thing ever to run the eight
    // checkout steps in a test.
    const checkout = await scenario.do(
      'starts the checkout workflow',
      'startCheckout',
      {
        basketId: basket.basketId,
        userId: session.userId,
        shippingAddress: {
          line1: '1 Coverage Way',
          city: 'London',
          postcode: 'EC1',
          country: 'GB',
        },
      },
      { actor: shopper }
    )

    await scenario.do(
      'lists orders',
      'listOrders',
      { limit: 20, offset: 0 },
      { actor: shopper }
    )

    await scenario.do('runs the sales report', 'dailySalesReport', null, {
      actor: admin,
    })
    await scenario.do('queues an order export', 'startExport', null, {
      actor: admin,
    })
    await scenario.do(
      'runs the conditional report',
      'conditionalReport',
      null,
      { actor: admin }
    )
    await scenario.do(
      'sweeps abandoned baskets',
      'cleanupAbandonedBaskets',
      null,
      { actor: admin }
    )

    // The scheduled sweep that replaced the setInterval poller. It fires the
    // trigger handler for each row it finds, so this covers both.
    // The domain half of the payment webhook. The addon's receiver verifies the
    // signature and queues the event; this is the worker that turns it into a
    // paid order, and it is the half worth testing — signature verification is
    // the addon's own concern and its own tests.
    await scenario.do(
      'applies a verified stripe event',
      'applyStripeEvent',
      {
        type: 'payment_intent.succeeded',
        data: {
          object: { id: 'pi_coverage', metadata: { orderId: 'ord_probe' } },
        },
      },
      { actor: actors.alex }
    )

    // The refund path. `refundWorkflow` had `checkOrderRefundable` and
    // `issueRefund` behind it and no way in — a workflow cannot be invoked over
    // RPC, so all three sat complete and unrunnable until `startRefund`.
    // ord_probe is seeded 'pending'; the payment webhook journey pays it.
    await scenario.do(
      'refunds an order',
      'startRefund',
      { orderId: 'ord_probe', reason: 'requested_by_customer' },
      { actor: actors.priya }
    )

    // Both versions of the same route. `getItem@v1` and `getItem@v2` are the
    // template's demonstration that a function can be versioned without
    // breaking callers, and neither had ever been called.
    await scenario.do(
      'reads item v1',
      'getItemV1',
      { itemId: 'itm_mug' },
      { actor: actors.visitor }
    )
    await scenario.do(
      'reads item v2',
      'getItemV2',
      { itemId: 'itm_mug' },
      { actor: actors.visitor }
    )

    await scenario.do('runs the scheduled sweep', 'sweepLowStock', null, {
      actor: admin,
    })

    await scenario.do('reads the stored profile', 'getProfile', null, {
      actor: actors.alex,
    })

    // The MCP tools. Annotated unreachable until `pikku dev` was taught to hand
    // the server its generated manifest — the transport was never mounted, so
    // /mcp answered 404 and no client could call one. Now they run for real.
    await scenario.then(
      'calls listCategoriesTool',
      'callsMcpTool',
      { tool: 'listCategoriesTool', args: '{}' },
      { actor: actors.alex }
    )
    await scenario.then(
      'calls listItemsTool',
      'callsMcpTool',
      { tool: 'listItemsTool', args: '{\"limit\":5}' },
      { actor: actors.alex }
    )
    await scenario.then(
      'calls getItemTool',
      'callsMcpTool',
      { tool: 'getItemTool', args: '{\"itemId\":\"itm_mug\"}' },
      { actor: actors.alex }
    )
    await scenario.then(
      'calls getItemForAI',
      'callsMcpTool',
      { tool: 'getItemForAI', args: '{\"itemId\":\"itm_mug\"}' },
      { actor: actors.alex }
    )
    await scenario.then(
      'calls updateStockTool',
      'callsMcpTool',
      {
        tool: 'updateStockTool',
        args: '{\"itemId\":\"itm_mug\",\"stock\":42}',
      },
      { actor: actors.alex }
    )

    logger.info({
      event: 'coverage_pass',
      user: session.email,
      checkout: JSON.stringify(checkout),
    })
    return { checked: 12 }
  },
})

export const coverageFeature = pikkuFeature({
  name: 'Coverage',
  description: 'Every callable function runs at least once',
  tags: ['coverage'],
  scenarios: [everyFunctionRuns],
})
