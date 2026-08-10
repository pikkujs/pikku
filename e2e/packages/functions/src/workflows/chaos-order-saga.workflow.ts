import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Order fulfilment as a saga: every step that touches the world names the
 * compensation that undoes it, so a failure late in the flow unwinds the
 * earlier effects rather than leaving a half-shipped order.
 *
 * `onError` is compensation, not recovery — the original error still
 * propagates and the run fails. The assertion this workflow supports is
 * therefore about the *ledger*: when payment fails for good, the inventory
 * reservation must have a matching `compensate:` entry.
 */
export const chaosOrderSagaWorkflow = pikkuWorkflowFunc<
  {
    orderId: string
    /** Attempts below this fail for the payment step, modelling a flaky PSP. */
    paymentFlakyUntil?: number
    /** Hold payment down until the external switch is cleared. */
    paymentDependency?: string
    /** Payment never succeeds — drives the compensation path. */
    paymentFatal?: boolean
    /** Widen the courier step so a kill lands inside it. */
    courierDelayMs?: number
  },
  { orderId: string; reserved: number; charged: number; shipped: boolean }
>({
  func: async ({}, data, { workflow }) => {
    const reserved = await workflow.do(
      'Reserve inventory',
      'chaosStep',
      { key: `reserve:${data.orderId}`, echo: data.orderId },
      { onError: 'chaosCompensate' }
    )

    const charged = await workflow.do(
      'Charge payment',
      'chaosStep',
      {
        key: `charge:${data.orderId}`,
        failAttemptsBelow: data.paymentFlakyUntil,
        dependency: data.paymentDependency,
        failAlways: data.paymentFatal,
        echo: data.orderId,
      },
      { retries: 3, retryDelay: '1s', onError: 'chaosCompensate' }
    )

    await workflow.do('Allocate courier', 'chaosStep', {
      key: `courier:${data.orderId}`,
      delayMs: data.courierDelayMs,
      echo: data.orderId,
    })

    const shipped = await workflow.do('Ship order', 'chaosStep', {
      key: `ship:${data.orderId}`,
      echo: data.orderId,
    })

    return {
      orderId: data.orderId,
      reserved: reserved.totalEffects,
      charged: charged.attempt,
      shipped: shipped.totalEffects > 0,
    }
  },
  tags: ['chaos', 'saga'],
})
