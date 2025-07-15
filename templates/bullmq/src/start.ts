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
    // Test a successful job
    setTimeout(async () => {
      const queueJob = await bullQueueService.add('hello-world-queue', {
        message: 'Hello from Bull!',
        fail: false,
      })
      const job = await bullQueueService.getJob('hello-world-queue', queueJob)
      if (!job) {
        throw new Error('Job not found')
      }
      console.log(job.waitForCompletion?.())
    }, 2000)

    // Test a failing job
    setTimeout(async () => {
      const queueJob = await bullQueueService.add('hello-world-queue', {
        message: 'Sorry in advance',
        fail: true,
      })
      const job = await bullQueueService.getJob('hello-world-queue', queueJob)
      if (!job) {
        throw new Error('Job not found')
      }
      console.log(job.waitForCompletion?.())
    }, 4000)
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
