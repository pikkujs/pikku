import { BullQueueWorkers, BullQueueService } from '@pikku/queue-bullmq'
import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap-queue.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)
    singletonServices.logger.info('Starting Bull queue adaptor...')
    const bullQueueWorkers = new BullQueueWorkers(
      {},
      singletonServices,
      createSessionServices
    )
    await bullQueueWorkers.registerQueues()
    const bullQueueService = new BullQueueService(undefined)

    setTimeout(async () => {
      const queueJob = await bullQueueService.add('hello-world-queue', {
        message: 'Hello from Bull!',
        fail: false,
      })
      console.log(await queueJob.waitForCompletion?.())
    }, 2000)

    setTimeout(async () => {
      const queueJob = await bullQueueService.add('hello-world-queue', {
        message: 'Sorry in advance',
        fail: true,
      })
      console.log(await queueJob.waitForCompletion?.())
    }, 4000)
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
