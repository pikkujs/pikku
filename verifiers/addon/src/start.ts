import { runPikkuFunc } from '@pikku/core'
import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from './services.js'

interface LogEntry {
  level: string
  message: string | object
}

/**
 * Custom logger that captures log entries for verification
 */
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
  setLevel() {
    // no-op for capturing logger
  }
}

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const logger = new CapturingLogger()

    // Create singleton services with our capturing logger
    const baseSingletonServices = await createSingletonServices(config)
    const singletonServices = {
      ...baseSingletonServices,
      logger,
    }

    console.log('\nAddon Verifier')
    console.log('=========================')
    console.log(
      '\nThis verifier tests that addon services are created and executed correctly.\n'
    )

    // Test: Call testAddonHello which invokes ext:hello
    console.log('Test: Addon Service Creation')
    console.log('───────────────────────────────────────')

    const result = await runPikkuFunc<
      { name: string; greeting?: string },
      { message: string; timestamp: number; noopCalls: number }
    >('rpc', 'testAddonHello', 'testAddonHello', {
      singletonServices,
      createWireServices,
      data: () => ({ name: 'Test', greeting: 'Hello' }),
      wire: {},
    })

    console.log('\nResult:', JSON.stringify(result, null, 2))

    // Verify the result contains expected data
    let passed = true

    // Check 1: noopCalls should be 1 (service was created and executed)
    if (result.noopCalls === 1) {
      console.log('✓ NoopService was created and executed (noopCalls: 1)')
    } else {
      console.log(
        `✗ NoopService execution failed - expected noopCalls: 1, got: ${result.noopCalls}`
      )
      passed = false
    }

    // Check 2: message should be formatted correctly
    if (result.message === 'Hello, Test!') {
      console.log('✓ Message formatted correctly')
    } else {
      console.log(
        `✗ Message format failed - expected "Hello, Test!", got: "${result.message}"`
      )
      passed = false
    }

    // Check 3: Logger should have been invoked by the addon
    const addonLog = logger.logs.find(
      (log) => typeof log.message === 'string' && log.message.includes('Addon:')
    )
    if (addonLog) {
      console.log('✓ Addon logger was invoked')
      console.log(`  Log: ${addonLog.message}`)
    } else {
      console.log('✗ Addon logger was not invoked')
      console.log('  Captured logs:', JSON.stringify(logger.logs, null, 2))
      passed = false
    }

    console.log('\n───────────────────────────────────────')
    if (passed) {
      console.log('✓ All tests passed!')
    } else {
      console.log('✗ Some tests failed!')
      process.exit(1)
    }
  } catch (e: any) {
    console.error('\n✗ Error:', e.message)
    console.error(e.stack)
    process.exit(1)
  }
}

main()
