import { BullQueueService } from '@pikku/queue-bullmq'
import { PikkuQueue } from '../../functions/.pikku/pikku-queue.gen.js'

async function main(): Promise<void> {
  try {
    const bullQueueService = new BullQueueService(undefined)
    const queueService = new PikkuQueue(bullQueueService)

    let returnCount = 0
    let successful = true

    // Test a successful job
    setTimeout(async () => {
      try {
        const queueJob = await queueService.add('hello-world-queue', {
          message: 'Hello from Bull!',
          fail: false,
        })
        const job = await queueService.getJob('hello-world-queue', queueJob)
        if (!job) {
          throw new Error('Job not found')
        }
        const result = await job.waitForCompletion?.()
        console.log('✓ Successful job completed:', result)
      } catch (error: any) {
        console.error('✗ Successful job failed:', error.message)
        successful = false
      } finally {
        returnCount++
      }
    }, 2000)

    // Test a failing job
    setTimeout(async () => {
      try {
        const queueJob = await queueService.add('hello-world-queue', {
          message: 'Sorry in advance',
          fail: true,
        })
        const job = await queueService.getJob('hello-world-queue', queueJob)
        if (!job) {
          throw new Error('Job not found')
        }
        const result = await job.waitForCompletion?.()
        console.log('✗ Failed job unexpectedly succeeded:', result)
        successful = false
      } catch (error: any) {
        console.log('✓ Failed job correctly threw error:', error.message)
      } finally {
        returnCount++
      }
    }, 4000)

    setInterval(() => {
      if (returnCount >= 2) {
        process.exit(successful ? 0 : 1)
      }
    }, 1000)
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
