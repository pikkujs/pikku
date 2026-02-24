import { BullServiceFactory } from '@pikku/queue-bullmq'
import { stopSingletonServices } from '@pikku/core'
import {
  createConfig,
  createSingletonServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)
    singletonServices.logger.info('Starting Bull queue adaptor...')

    const bullFactory = new BullServiceFactory()
    await bullFactory.init()

    const bullQueueWorkers = bullFactory.getQueueWorkers()
    await bullQueueWorkers.registerQueues()

    const shutdown = async (signal: string) => {
      singletonServices.logger.info(
        `Received ${signal}, shutting down gracefully...`
      )
      await bullFactory.close()
      await stopSingletonServices()
      process.exit(0)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
