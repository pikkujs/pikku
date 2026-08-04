import { runPikkuFunc, type Safe } from '@pikku/core'
import { createConfig, createSingletonServices, createWireServices } from './services.js'

interface LogEntry {
  level: string
  message: string | object
}

/** Logger that captures entries so we can assert the addon logged. */
class CapturingLogger {
  public logs: LogEntry[] = []

  // `Logger` guards every parameter with `Safe<>` so a vault secret cannot be
  // logged. A test double has to carry the same signature to be usable as one:
  // a plainer `(message: string | object)` no longer satisfies it, since
  // `Safe<M>` is a deferred conditional type and the rest parameter makes the
  // arity check strict.
  private capture(level: string, message: unknown) {
    this.logs.push({ level, message: message as string | object })
  }

  info<M extends string | Record<string, any>, A extends unknown[]>(
    message: Safe<M>,
    ..._meta: { [K in keyof A]: Safe<A[K]> }
  ) {
    this.capture('info', message)
  }
  warn<M extends string | Record<string, any>, A extends unknown[]>(
    message: Safe<M>,
    ..._meta: { [K in keyof A]: Safe<A[K]> }
  ) {
    this.capture('warn', message)
  }
  error<M extends string | Record<string, any> | Error, A extends unknown[]>(
    message: Safe<M>,
    ..._meta: { [K in keyof A]: Safe<A[K]> }
  ) {
    this.capture('error', message)
  }
  debug<A extends unknown[]>(
    message: string,
    ..._meta: { [K in keyof A]: Safe<A[K]> }
  ) {
    this.capture('debug', message)
  }
  setLevel() {}
}

async function main(): Promise<void> {
  const config = await createConfig()
  const logger = new CapturingLogger()
  const baseSingletonServices = await createSingletonServices(config)
  const singletonServices = { ...baseSingletonServices, logger }

  // Invoke the consumer's own `consumeHello`, whose body calls
  // `rpc.invoke('ext:hello')`. This exercises the full chain: the `ext:`
  // namespace mapping that `wireAddon` registers → the addon installed from
  // the npm-pack artifact → its NoopService and host-logger usage.
  const result = await runPikkuFunc<
    { name: string; greeting?: string },
    { message: string; timestamp: number; noopCalls: number }
  >('rpc', 'consumeHello', 'consumeHello', {
    singletonServices,
    createWireServices,
    data: () => ({ name: 'Test', greeting: 'Hello' }),
    wire: {},
  })

  let passed = true
  if (result.noopCalls === 1) {
    console.log('✓ addon NoopService created + executed (noopCalls: 1)')
  } else {
    console.log(`✗ expected noopCalls: 1, got: ${result.noopCalls}`)
    passed = false
  }
  if (result.message === 'Hello, Test!') {
    console.log('✓ addon function returned the expected message')
  } else {
    console.log(`✗ expected "Hello, Test!", got: "${result.message}"`)
    passed = false
  }
  const addonLog = logger.logs.find(
    (l) => typeof l.message === 'string' && l.message.includes('Addon:')
  )
  if (addonLog) {
    console.log('✓ addon invoked the host logger')
  } else {
    console.log('✗ addon did not invoke the host logger')
    passed = false
  }

  if (!passed) process.exit(1)
}

main().catch((e) => {
  console.error('✗ runtime invoke failed:', e?.message ?? e)
  console.error(e?.stack)
  process.exit(1)
})
