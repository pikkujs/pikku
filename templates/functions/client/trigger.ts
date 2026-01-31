import { TriggerService } from '@pikku/core/services'
import { createConfig, createSingletonServices } from '../src/services.js'
import '../.pikku/pikku-bootstrap.gen.js'

async function main() {
  const config = await createConfig()

  const singletonServices = await createSingletonServices(config)

  const triggerService = new TriggerService(singletonServices)

  await triggerService.start()
  await triggerService.stop()

  console.log('Trigger lifecycle test passed')
  process.exit(0)
}

main().catch((err) => {
  console.error('Trigger test failed:', err)
  process.exit(1)
})
