import { pikkuScenario } from '../../../.pikku/scenarios/pikku-scenario-types.gen.js'
/**
 * A step declares one implementation per surface. An action resolves to exactly
 * one of them; an assertion runs every one it has. These three scenarios pin
 * both halves of that asymmetry plus the two ways it fails.
 */
export const surfaceBindingScenario = pikkuScenario<
  { orderId: string },
  { status: string }
>({
  title: 'Surface bindings (scenario)',
  tags: ['scenario', 'surfaces'],
  func: async (_services, data, { scenario }) => {
    await scenario.given('submits the order', 'submitsTheOrder', {
      orderId: data.orderId,
    })

    const settled = await scenario.then(
      'sees the order settled',
      'seesTheOrderSettled',
      {
        orderId: data.orderId,
      }
    )

    return { status: settled.status }
  },
})

export const surfaceDisagreementScenario = pikkuScenario<
  { orderId: string },
  { status: string }
>({
  title: 'Surface disagreement (scenario)',
  tags: ['scenario', 'surfaces'],
  func: async (_services, data, { scenario }) => {
    const paid = await scenario.then(
      'sees the order paid',
      'seesTheOrderPaid',
      {
        orderId: data.orderId,
      }
    )
    return { status: paid.status }
  },
})

export const surfaceUnrunnableScenario = pikkuScenario<
  { orderId: string },
  { cancelled: boolean }
>({
  title: 'Surface without a fallback (scenario)',
  tags: ['scenario', 'surfaces'],
  func: async (_services, data, { scenario }) => {
    const cancelled = await scenario.when(
      'cancels the order',
      'cancelsTheOrder',
      {
        orderId: data.orderId,
      }
    )
    // Never reached — the `when` above has no binding for a default run. It is
    // here because a scenario that never asserts is a PKU680 critical, and this
    // fixture has to survive codegen to be worth running.
    await scenario.then('sees the order settled', 'seesTheOrderSettled', {
      orderId: data.orderId,
    })
    return { cancelled: cancelled.cancelled }
  },
})
