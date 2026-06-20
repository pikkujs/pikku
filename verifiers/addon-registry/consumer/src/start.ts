import { runPikkuFunc } from '@pikku/core'
import { createConfig, createSingletonServices, createWireServices } from './services.js'

interface LogEntry {
  level: string
  message: string | object
}

/** Logger that captures entries so we can assert the addon logged. */
class CapturingLogger {
  public logs: LogEntry[] = []
  info(message: string | object) {
    this.logs.push({ level: 'info', message })
  }
  warn(message: string | object) {
    this.logs.push({ level: 'warn', message })
  }
  error(message: string | object) {
    this.logs.push({ level: 'error', message })
  }
  debug(message: string | object) {
    this.logs.push({ level: 'debug', message })
  }
  setLevel() {}
}

async function main(): Promise<void> {
  const config = await createConfig()
  const logger = new CapturingLogger()
  const baseSingletonServices = await createSingletonServices(config)
  const singletonServices = { ...baseSingletonServices, logger }

  // Invoke the addon installed from the npm-pack artifact. `packageName`
  // targets the addon's namespaced registry — the same resolution that
  // `rpc.invoke('ext:hello')` performs for a wired addon.
  const result = await runPikkuFunc<
    { name: string; greeting?: string },
    { message: string; timestamp: number; noopCalls: number }
  >('rpc', 'hello', 'hello', {
    singletonServices,
    createWireServices,
    data: () => ({ name: 'Test', greeting: 'Hello' }),
    wire: {},
    packageName: '@pikku/verifier-registry-addon',
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
