import { TriggerService, InMemoryWorkflowService } from '@pikku/core/services'
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

  const triggerService = new TriggerService(singletonServices)

  // Workflow targets are auto-registered from wiring declarations on start()
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
