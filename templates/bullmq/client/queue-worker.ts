import { BullQueueService } from '@pikku/queue-bullmq'
import { PikkuQueue } from '../../functions/.pikku/pikku-queue.gen.js'

async function main(): Promise<void> {
  try {
    const bullQueueService = new BullQueueService(undefined)
    const queueService = new PikkuQueue(bullQueueService)

    // Test a successful job
    setTimeout(async () => {
      const queueJob = await queueService.add('hello-world-queue', {
        message: 'Hello from Bull!',
        fail: false,
      })
      const job = await queueService.getJob('hello-world-queue', queueJob)
      if (!job) {
        throw new Error('Job not found')
      }
      console.log(job.waitForCompletion?.())
    }, 2000)

    // Test a failing job
    setTimeout(async () => {
      const queueJob = await queueService.add('hello-world-queue', {
        message: 'Sorry in advance',
        fail: true,
      })
      const job = await queueService.getJob('hello-world-queue', queueJob)
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
