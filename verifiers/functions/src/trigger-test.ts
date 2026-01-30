import '../.pikku/pikku-bootstrap.gen.js'
import './index.js'

import { createConfig, createSingletonServices } from './services.js'
import { InMemoryTriggerService } from '@pikku/core/services'
import { getInvoker } from './functions/trigger/trigger.functions.js'
import { getInvocations } from './functions/trigger/trigger-target.functions.js'

async function main(): Promise<void> {
  console.log('\nTrigger Integration Test')
  console.log('========================\n')

  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)

  const triggerService = new InMemoryTriggerService(singletonServices as any)

  // Register trigger → RPC target mapping
  await triggerService.register({
    trigger: 'test-event',
    input: { eventName: 'order-created' },
    target: { rpc: 'triggerTargetHandler' },
  })

  // Register a second target for the same trigger (multi-target test)
  await triggerService.register({
    trigger: 'test-event',
    input: { eventName: 'order-created' },
    target: { rpc: 'triggerTargetHandler' },
  })

  console.log('1. Registered trigger → RPC target mappings')

  // Start the trigger service
  await triggerService.start()
  console.log('2. TriggerService started')

  // Get the invoker that was stored by the trigger function
  const invoker = getInvoker('order-created')
  if (!invoker) {
    console.error('   FAIL: No invoker found for "order-created"')
    process.exit(1)
  }
  console.log('3. Trigger invoker obtained')

  // Fire the trigger manually
  invoker({ payload: 'test-order-123' })
  console.log('4. Trigger fired with payload')

  // Wait for async RPC invocation
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Verify the RPC target was called
  const invocations = getInvocations()
  if (invocations.length === 0) {
    console.error('   FAIL: triggerTargetHandler was never called')
    process.exit(1)
  }

  const firstInvocation = invocations[0]!
  if (firstInvocation.data.payload !== 'test-order-123') {
    console.error(
      `   FAIL: Expected payload "test-order-123", got "${firstInvocation.data.payload}"`
    )
    process.exit(1)
  }

  console.log(
    `5. RPC target invoked ${invocations.length} time(s) with correct data`
  )

  // Stop the trigger service
  await triggerService.stop()
  console.log('6. TriggerService stopped')

  // Verify invoker was cleaned up
  const invokerAfterStop = getInvoker('order-created')
  if (invokerAfterStop) {
    console.error('   FAIL: Invoker was not cleaned up after stop')
    process.exit(1)
  }
  console.log('7. Trigger teardown confirmed (invoker cleaned up)')

  console.log('\n\nAll trigger tests passed!')
}

main().catch((e) => {
  console.error('\nTrigger test failed:', e.message)
  console.error(e.stack)
  process.exit(1)
})
