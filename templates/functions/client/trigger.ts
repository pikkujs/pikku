import {
  InMemoryTriggerService,
  InMemoryWorkflowService,
} from '@pikku/core/services'
import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from '../src/services.js'
import '../.pikku/pikku-bootstrap.gen.js'

async function main() {
  const config = await createConfig()

  const workflowService = new InMemoryWorkflowService()

  const singletonServices = await createSingletonServices(config, {
    workflowService,
  })

  workflowService.setServices(singletonServices, createWireServices, config)

  const triggerService = new InMemoryTriggerService(singletonServices)

  // Test 1: RPC target
  await triggerService.register({
    trigger: 'test-event',
    input: { eventName: 'rpc-test' },
    target: { rpc: 'onTestEvent' },
  })

  // Test 2: Graph workflow target (should resolve startNode from trigger wire)
  await triggerService.register({
    trigger: 'test-event',
    input: { eventName: 'graph-test' },
    target: { workflow: 'todoReviewWorkflow' },
  })

  await triggerService.start()

  // The test-event trigger fires every 10s, wait for it
  console.log('Waiting for trigger to fire...')
  await new Promise((resolve) => setTimeout(resolve, 12_000))

  await triggerService.stop()

  console.log('Trigger test passed')
  process.exit(0)
}

main().catch((err) => {
  console.error('Trigger test failed:', err)
  process.exit(1)
})
