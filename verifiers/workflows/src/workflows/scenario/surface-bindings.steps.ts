import { pikkuScenarioStep } from '#pikku/scenario'
/**
 * Every binding writes the surface it ran on into this log, so a test can assert
 * which implementation the runner actually chose rather than inferring it from
 * the step's output.
 */
export const surfaceLog: string[] = []

export const resetSurfaceLog = () => {
  surfaceLog.length = 0
}

/**
 * An action with two bindings. `--run cli` takes the cli one; every other run
 * surface falls back to `default`.
 */
export const submitsTheOrder = pikkuScenarioStep<
  { orderId: string },
  { orderId: string }
>({
  name: 'submitsTheOrder',
  description: 'submits the order',
  cli: async (_services, data) => {
    surfaceLog.push('submitsTheOrder:cli')
    return { orderId: data.orderId }
  },
  default: async (_services, data) => {
    surfaceLog.push('submitsTheOrder:default')
    return { orderId: data.orderId }
  },
})

/**
 * An action with no `default`. A run that does not target `cli` has nothing to
 * fall back to, which is the failure `ScenarioNoSurfaceBinding` names.
 */
export const cancelsTheOrder = pikkuScenarioStep<
  { orderId: string },
  { cancelled: boolean }
>({
  name: 'cancelsTheOrder',
  description: 'cancels the order',
  cli: async () => {
    surfaceLog.push('cancelsTheOrder:cli')
    return { cancelled: true }
  },
})

/**
 * An assertion with two witnesses. Unlike an action, both run and both must
 * agree — the point of the phase is that the surface and the system of record
 * are checked against each other.
 */
export const seesTheOrderSettled = pikkuScenarioStep<
  { orderId: string },
  { status: string }
>({
  name: 'seesTheOrderSettled',
  description: 'sees the order settled',
  cli: async () => {
    surfaceLog.push('seesTheOrderSettled:cli')
    return { status: 'settled' }
  },
  default: async () => {
    surfaceLog.push('seesTheOrderSettled:default')
    return { status: 'settled' }
  },
})

/**
 * The same assertion, wired to witnesses that report different things. Whichever
 * one is lying, the run must fail rather than report a pass.
 */
export const seesTheOrderPaid = pikkuScenarioStep<
  { orderId: string },
  { status: string }
>({
  name: 'seesTheOrderPaid',
  description: 'sees the order paid',
  cli: async () => {
    surfaceLog.push('seesTheOrderPaid:cli')
    return { status: 'paid' }
  },
  default: async () => {
    surfaceLog.push('seesTheOrderPaid:default')
    return { status: 'pending' }
  },
})
