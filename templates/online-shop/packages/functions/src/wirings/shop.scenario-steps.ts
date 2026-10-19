import {
  createCookieJar,
  pikkuAddonScenarioStep,
  pikkuPlatformScenarioStep,
  pikkuScenarioHook,
  pollUntil,
  postScenarioJson,
  readScenarioHttpResponse,
  requireScenarioEnv,
} from '#pikku/scenarios'
import { createScenarioRunner } from '@pikku/core/scenario'

// @snippet start addonScenarioStep
// A step in which a third-party system acts. `addon` names the addon that wraps
// the service, the same name its `wireAddon` declares. This arranges, it does
// not assert: "Stripe's webhook arrives" is a stub, "Then Stripe was charged"
// is an assertion.
export const stripeReportsPayment = pikkuAddonScenarioStep<
  { orderId: string; paymentIntentId?: string },
  unknown
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
// @snippet end addonScenarioStep

// @snippet start platformScenarioStep
// A step in which the app acts on itself. The subject of "the shop ships the
// order" is the app, not a user of it, so there is no actor.
export const shipsTheOrder = pikkuPlatformScenarioStep<{ orderId: string }, { orderId: string }>({
  name: 'shipsTheOrder',
  description: 'ships an order, which is what tells the shopper it is on its way',
  template: 'ships order {orderId}',
  func: async (_services, { orderId }, { rpc }) => {
    await rpc.invoke('notifyOrderShipped', { orderId })
    return { orderId }
  },
})
// @snippet end platformScenarioStep

// @snippet start scenarioHook
// Empties the basket before the assistant is asked to fill it. Without this,
// a basket a previous run left full would satisfy "the basket has the mug"
// whether or not the assistant did anything.
export const emptiesTheBasket = pikkuScenarioHook(async (_services, _data, { actors }) => {
  const basket = await actors.shopper.invoke('getBasket', {})
  for (const item of basket.items) {
    await actors.shopper.invoke('removeFromBasket', {
      basketId: basket.basketId,
      itemId: item.itemId,
    })
  }
})
// @snippet end scenarioHook

const TERMINAL = ['completed', 'failed', 'cancelled']

export const startsCheckoutOverHttp = pikkuPlatformScenarioStep<
  { basketId: string; userId: string },
  { status: number; runId?: string; outcome?: string }
>({
  name: 'startsCheckoutOverHttp',
  description: 'starts the checkout workflow over HTTP and waits for it to settle',
  func: async (_services, { basketId, userId }, { scenarioStep }) => {
    // @snippet start scenarioPostJson
    const { apiUrl } = requireScenarioEnv(scenarioStep)
    const response = await postScenarioJson<{ runId?: string } | undefined>(
      `${apiUrl}/workflow/checkoutWorkflow/start`,
      { body: { data: { basketId, userId } } },
    )
    const run = { ...response, runId: response.body?.runId }
    // @snippet end scenarioPostJson

    // @snippet start scenarioPollUntil
    const finished = await pollUntil(
      async () => {
        const response = await readScenarioHttpResponse<{ status?: string } | undefined>(
          await fetch(`${apiUrl}/workflow/checkoutWorkflow/status/${run.runId}`),
        )
        const outcome = response.body?.status
        return outcome && TERMINAL.includes(outcome) ? { ...response, outcome } : undefined
      },
      { timeoutMs: 30_000, intervalMs: 100 },
    )
    if (!finished) throw new Error(`Run ${run.runId} never finished`)
    // @snippet end scenarioPollUntil

    return { status: finished.status, runId: run.runId, outcome: finished.outcome }
  },
})

export const signsUpShopper = pikkuPlatformScenarioStep<
  { email: string; password: string },
  { email?: string }
>({
  name: 'signsUpShopper',
  description: 'signs a new shopper up and reads the session back',
  func: async (_services, { email, password }, { scenarioStep }) => {
    // @snippet start scenarioCookieJar
    const { apiUrl } = requireScenarioEnv(scenarioStep)
    const jar = createCookieJar(apiUrl)
    await jar.fetch(`${apiUrl}/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, name: email }),
    })
    const session = await readScenarioHttpResponse<{
      user?: { email?: string }
    } | null>(await jar.fetch(`${apiUrl}/auth/get-session`))
    // @snippet end scenarioCookieJar
    return { email: session.body?.user?.email }
  },
})

// @snippet start scenarioRunner
export const { workflowService, scenarioService } = createScenarioRunner()
// @snippet end scenarioRunner
