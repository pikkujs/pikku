/**
 * Steps whose grammatical subject is not a person.
 *
 * "The shop ships the order" and "Stripe's webhook arrives" are both things
 * that happen to a scenario rather than things an actor does, and writing them
 * as persona steps with the actor left off would put somebody in a sentence
 * that has none.
 */
import {
  pikkuAddonScenarioStep,
  pikkuPlatformScenarioStep,
} from '#pikku/scenarios'

// @snippet start platformStep
/**
 * Shipping is the shop acting on itself: no shopper clicks it, and the order
 * update the customer receives is a consequence rather than a request.
 */
export const shipsTheOrder = pikkuPlatformScenarioStep<
  { orderId: string },
  { orderId: string }
>({
  name: 'shipsTheOrder',
  description:
    'ships an order, which is what tells the shopper it is on its way',
  template: 'ships order {orderId}',
  func: async (_services, { orderId }, { rpc }) => {
    await rpc.invoke('notifyOrderShipped', { orderId })
    return { orderId }
  },
})
// @snippet end platformStep

// @snippet start addonStep
/**
 * Stripe telling us the card cleared. `addon` names the wiring it belongs to —
 * the same `stripe` that `wireAddon` declares — so the step is filed under the
 * service it speaks for rather than under the shop.
 *
 * This arranges, it does not assert: a scenario uses it to get an order into
 * the paid state without a real card, and checks the consequences separately.
 */
export const stripeReportsPayment = pikkuAddonScenarioStep<
  { orderId: string; paymentIntentId?: string },
  { applied: boolean }
>({
  addon: 'stripe',
  name: 'stripeReportsPayment',
  description: 'delivers a payment_intent.succeeded event for an order',
  template: 'Stripe confirms payment for {orderId}',
  func: async (_services, { orderId, paymentIntentId }, { rpc }) => {
    return rpc.invoke('applyStripeEvent', {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: paymentIntentId ?? `pi_${orderId}`,
          metadata: { orderId },
        },
      },
    })
  },
})
// @snippet end addonStep
