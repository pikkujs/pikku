import { addFunction, runPikkuFunc } from '@pikku/core/function'
import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { childTraceWire, createTrace } from '@pikku/core/trace'
import type { Logger } from '@pikku/core/services'
import type { Tracer } from '@pikku/core/trace'

/**
 * A two-hop app run through the real function runner: an http-wired
 * `createInvoice` that calls `chargeCard` over a local rpc hop (a child span),
 * and a `refuse` function that throws. What matters to the verifier is that the
 * spans, logs and metrics it produces leave through `createRuntimeTelemetry`.
 */
export const ERROR_MESSAGE = 'card declined'

const register = (name: string, func: (...args: any[]) => unknown) => {
  addFunction(name, { func })
  pikkuState(null, 'function', 'meta')[name] = {
    pikkuFuncId: name,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  }
}

export const runApp = async (services: { logger: Logger; tracer: Tracer }) => {
  resetPikkuState()
  const run = (
    wireType: 'http' | 'rpc',
    funcName: string,
    wire: Record<string, unknown>
  ) =>
    runPikkuFunc(wireType, `${wireType}:${funcName}`, funcName, {
      singletonServices: services,
      getAllServices: () => services,
      data: () => ({}),
      auth: false,
      wire,
    } as never)

  register('chargeCard', async () => {
    services.logger.info({ message: 'charging', amount: 12 })
    return { charged: true }
  })
  register('createInvoice', async (_s: unknown, _d: unknown, wire: any) => {
    await run('rpc', 'chargeCard', { trace: childTraceWire(wire.trace).trace })
    services.logger.warn('invoice created with a warning')
    return { id: 'inv_1' }
  })
  register('refuse', async () => {
    throw new Error(ERROR_MESSAGE)
  })

  const trace = createTrace()
  await run('http', 'createInvoice', {
    trace,
    http: {
      request: { method: () => 'POST' },
      response: { statusCode: 201 },
    },
  })
  const failing = createTrace()
  await run('http', 'refuse', { trace: failing }).catch(() => {})
  return { trace, failing }
}
