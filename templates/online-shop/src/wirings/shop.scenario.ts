import { pikkuScenario, pikkuScenarioHook } from '#pikku/scenarios'

// @snippet start scenarioBasics
// A scenario is a workflow whose steps run as real users ("virtualUsers") over the
// real transport — sign-in, auth middleware, permissions and serialization are
// all exercised end-to-end. The same flow doubles as an e2e test and a
// staging/production health check. Virtual users are registered in pikku.config.json.
export const shopperBuysAnItem = pikkuScenario({
  title: 'Shopper buys an item',
  description: 'Browse the catalogue, fill a basket and pay for an order.',
  tags: ['checkout'],
  func: async ({ logger }, _input, { scenario, virtualUsers }) => {
    if (!virtualUsers?.shopper) {
      throw new Error(
        'shopperBuysAnItem needs the `shopper` virtual user — run via `pikku scenario run`'
      )
    }
    const shopper = virtualUsers.shopper

    // @snippet start scenarioSteps
    // Each step names what the virtual user is trying to achieve, the exposed RPC
    // that achieves it, and who performs it. The call goes through the virtual user's
    // authenticated client — never internal dispatch.
    const basket = await scenario.do(
      'Shopper opens their basket',
      'getBasket',
      {},
      { virtualUser: shopper }
    )

    const catalogue = await scenario.do(
      'Shopper browses the catalogue',
      'listItems',
      { search: 'mug' },
      { virtualUser: shopper }
    )
    if (catalogue.items.length === 0)
      throw new Error('Catalogue has no mugs to buy')
    // @snippet end scenarioSteps

    await scenario.do(
      'Shopper adds a mug to the basket',
      'addToBasket',
      {
        basketId: basket.basketId,
        itemId: catalogue.items[0]!.itemId,
        quantity: 1,
      },
      { virtualUser: shopper }
    )

    const order = await scenario.do(
      'Shopper checks out',
      'createOrder',
      {
        basketId: basket.basketId,
        shippingAddress: {
          line1: '1 High Street',
          city: 'London',
          postcode: 'N1 1AA',
          country: 'GB',
        },
      },
      { virtualUser: shopper }
    )

    // Durable polling step: re-invokes the RPC as the virtual user until the
    // predicate passes, or `within` elapses and fails the scenario.
    await scenario.expectEventually(
      'Order is paid',
      'getOrder',
      { orderId: order.orderId },
      (o: { status: string }) => o.status === 'paid',
      { virtualUser: shopper, within: '30s', interval: 500 }
    )

    logger.info(
      `Scenario order ${order.orderId} paid: ${order.totalCents} cents`
    )
    return { orderId: order.orderId, totalCents: order.totalCents }
  },
})
// @snippet end scenarioBasics

// @snippet start scenarioHook
/**
 * Empties the shopper's basket before the assistant is asked to fill it.
 *
 * The scenario's real assertion is "the basket now has the mug", and a basket
 * a previous run left full satisfies that whether or not the assistant did
 * anything. A hook runs outside the recorded steps, so the tidying never shows
 * up in the report as something the shopper did.
 */
const emptiesTheBasket = pikkuScenarioHook(
  async (_services, _data, { virtualUsers }) => {
    const basket = await virtualUsers.shopper.invoke('getBasket', {})
    for (const item of basket.items) {
      await virtualUsers.shopper.invoke('removeFromBasket', {
        basketId: basket.basketId,
        itemId: item.itemId,
      })
    }
  }
)
// @snippet end scenarioHook

// @snippet start scenarioConverse
// Virtual users can also hold a free-form conversation with one of your AI agents,
// in virtual user. The virtual user drives the agent over the real transport, answers its
// tool-approval requests, and returns a verdict on whether the task was met.
export const shopperAsksTheAssistant = pikkuScenario({
  before: emptiesTheBasket,
  title: 'Shopper gets help from the assistant',
  description: 'The shop assistant finds a product and adds it to the basket.',
  tags: ['agents'],
  func: async ({ logger }, _input, { scenario, virtualUsers }) => {
    if (!virtualUsers?.shopper) {
      throw new Error(
        'shopperAsksTheAssistant needs the `shopper` virtual user — run via `pikku scenario run`'
      )
    }
    const shopper = virtualUsers.shopper

    // @snippet start converseSteps
    const verdict = await scenario.do(
      'Shopper chats to the assistant',
      async () =>
        shopper.converse({
          agent: 'shopAssistant',
          task: 'Find a coffee mug in the shop and add one to my basket.',
          evaluate:
            'The assistant found a mug and confirmed it is in the basket.',
        })
    )
    if (!verdict.passed) {
      logger.error(verdict.transcript.join('\n'))
      throw new Error(`Assistant flow failed: ${verdict.reasoning}`)
    }

    // The verdict is the virtual user's judgement — follow up with a deterministic
    // check through the same virtual user.
    const basket = await scenario.do(
      'Basket really has the mug',
      'getBasket',
      {},
      { virtualUser: shopper }
    )
    if (basket.itemCount === 0)
      throw new Error('Assistant claimed success but the basket is empty')
    // @snippet end converseSteps

    return { itemCount: basket.itemCount }
  },
})
// @snippet end scenarioConverse
