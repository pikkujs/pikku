import { BullQueueService } from '@pikku/queue-bullmq'
import { PikkuQueue } from '../../functions/.pikku/pikku-queue.gen.js'

async function main(): Promise<void> {
  try {
    const bullQueueService = new BullQueueService(undefined)
    const queueService = new PikkuQueue(bullQueueService)

    let returnCount = 0
    let successful = true

    setTimeout(async () => {
      try {
        const queueJob = await queueService.add('todo-reminders', {
          todoId: 'test-todo-123',
          userId: 'test-user-456',
        })
        const job = await queueService.getJob('todo-reminders', queueJob)
        if (!job) {
          throw new Error('Job not found')
        }
        const result = await job.waitForCompletion?.()
        console.log('✓ Reminder job completed:', result)
      } catch (error: any) {
        console.error('✗ Reminder job failed:', error.message)
        successful = false
      } finally {
        returnCount++
      }
    }, 2000)

    setTimeout(async () => {
      try {
        const queueJob = await queueService.add('todo-reminders', {
          todoId: 'another-todo-789',
          userId: 'another-user-012',
        })
        const job = await queueService.getJob('todo-reminders', queueJob)
        if (!job) {
          throw new Error('Job not found')
        }
        const result = await job.waitForCompletion?.()
        console.log('✓ Second reminder job completed:', result)
      } catch (error: any) {
        console.error('✗ Second reminder job failed:', error.message)
        successful = false
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
