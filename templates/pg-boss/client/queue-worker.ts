import { PikkuQueue } from '../../functions/.pikku/pikku-queue.gen.js'
import { PgBossServiceFactory } from '@pikku/queue-pg-boss'

// Use DATABASE_URL environment variable or provide a connection string
const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:password@localhost:5432/pikku_queue'

async function main(): Promise<void> {
  try {
    const pgBossFactory = new PgBossServiceFactory(connectionString)
    await pgBossFactory.init()
    const queueService = new PikkuQueue(pgBossFactory.getQueueService())

    let returnCount = 0
    let successful = true

    // Test a successful job (todo exists scenario - will return "not found" but processes successfully)
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

    // Test another job with different data
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

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      await pgBossFactory.close()
      process.exit(0)
    })
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
