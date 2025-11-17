import { BullQueueWorkers } from '@pikku/queue-bullmq'
import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)
    singletonServices.logger.info('Starting Bull queue adaptor...')
    const bullQueueWorkers = new BullQueueWorkers(
      {},
      singletonServices,
      createWireServices
    )
    await bullQueueWorkers.registerQueues()
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
