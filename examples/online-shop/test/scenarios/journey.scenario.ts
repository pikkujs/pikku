/**
 * The job this app exists for, performed through the browser.
 *
 * The shop's own home page states the journey: "Browse the catalogue, fill a
 * basket, and check out." This scenario is that sentence, clicked.
 *
 * It is expected to FAIL today, and the failure is the finding. `addToBasket`,
 * `getBasket`, `removeFromBasket`, `createOrder`, `listOrders` and
 * `checkout.workflow.ts` are all wired and exercised by `shopperBuysAnItem` —
 * which completes a purchase over RPC without ever asking whether a person
 * could. There is no basket route, no basket count in the shell, and no
 * checkout screen, so the shopper can put things in and never see them again.
 *
 * Do not weaken this scenario to make it pass. It should stay red until the
 * basket and order screens exist, then pass without being touched.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const shopperBuysAnItemInTheBrowser = pikkuScenario<
  void,
  { landed: string }
>({
  title: 'A shopper fills a basket and checks out',
  description:
    'The journey the home page promises, performed by clicking rather than over RPC',
  tags: ['scenario', 'journey'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.visitor) {
      throw new Error(
        'needs the `visitor` actor — run via `pikku scenario run <environment>`'
      )
    }
    await scenario.then(
      'opens the app',
      'opensPage',
      { path: '/app' },
      { actor: actors.visitor }
    )
    await scenario.then(
      'clicks through to the catalogue',
      'clicks',
      { name: 'Catalogue' },
      { actor: actors.visitor }
    )
    await scenario.then(
      'is on the catalogue',
      'restsOnPath',
      { path: '/app/catalogue' },
      { actor: actors.visitor }
    )

    await scenario.then(
      'sees a mug for sale',
      'seesText',
      { text: 'Enamel coffee mug' },
      { actor: actors.visitor }
    )
    // Next to the mug specifically. The catalogue has eight of these buttons
    // and `clicks` would take the first, which belongs to the espresso.
    await scenario.then(
      'adds it to the basket',
      'clicksNear',
      { near: 'Enamel coffee mug', name: 'Add to basket' },
      { actor: actors.visitor }
    )

    // Everything above this line passes today. Everything below it fails,
    // because the screens it needs were never built.
    const basket = await scenario.then(
      'opens the basket',
      'clicks',
      { name: 'Basket' },
      { actor: actors.visitor }
    )
    await scenario.then(
      'sees the mug in it',
      'seesText',
      { text: 'Enamel coffee mug' },
      { actor: actors.visitor }
    )
    await scenario.then(
      'checks out',
      'clicks',
      { name: 'Checkout' },
      { actor: actors.visitor }
    )
    await scenario.then(
      'sees the order confirmed',
      'seesText',
      { text: 'Order' },
      { actor: actors.visitor }
    )

    // The operations screen, which is also the only thing that opens the
    // channel: `LiveFeed` connects on mount and sends the subscribe action, so
    // asserting the panel is here is the only test that touches the realtime
    // surface at all.
    await scenario.then(
      'opens operations',
      'clicks',
      { name: 'Manage' },
      { actor: actors.visitor }
    )
    await scenario.then(
      'sees the live panel',
      'seesText',
      { text: 'activity' },
      { actor: actors.visitor }
    )

    // The payment webhook, which is Stripe's receiver rather than one of ours.
    //
    // It answers 400 without a valid `stripe-signature`, and that IS the
    // assertion: the route this replaced accepted anything, so posting nonsense
    // to it returned 200 and the test proved only that a URL existed. Signing a
    // real event needs the webhook secret, which a browser must never hold — so
    // the signed path belongs in a server-side test, not here.
    await scenario.then(
      'is refused an unsigned payment webhook',
      'postsTo',
      {
        path: '/api/webhooks/stripe',
        body: '{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_coverage"}}}',
        minStatus: 400,
        maxStatus: 499,
      },
      { actor: actors.visitor }
    )

    // the analytics beacon — an HTTP-only surface. Posting from the browser rather than
    // exposing it over RPC keeps the boundary it demonstrates intact.
    await scenario.then(
      'posts to /api/analytics',
      'postsTo',
      {
        path: '/api/analytics',
        body: '{"events":[{"event":{"name":"page_viewed","path":"/app/catalogue"}}]}',
        minStatus: 0,
        maxStatus: 299,
      },
      { actor: actors.visitor }
    )

    // The realtime surface, opened and closed deliberately. Visiting the page
    // already runs this handler, but nothing asserted the socket reached OPEN —
    // a channel with a broken route or a failing auth check looks identical to
    // a quiet one.
    await scenario.then(
      'subscribes to the channel',
      'subscribesToChannel',
      {
        route: '/orders/status',
        action: 'subscribeToOrder',
        // And release it. `LiveFeed` does the same on unmount — leaving the hub
        // holding a subscription for a channel that has gone.
        unsubscribeAction: 'unsubscribeFromOrder',
      },
      { actor: actors.visitor }
    )

    return { landed: basket.pathname }
  },
})

export const journeyFeature = pikkuFeature({
  name: 'Browser journey',
  description: 'The job this app exists for, performed by clicking',
  tags: ['journey'],
  scenarios: [shopperBuysAnItemInTheBrowser],
})
