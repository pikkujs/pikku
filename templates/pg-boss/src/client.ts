import { PikkuQueue } from '../../functions/.pikku/pikku-queue.gen.js'
import { PgBossQueueService } from '@pikku/queue-pg-boss'

// Use DATABASE_URL environment variable or provide a connection string
const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:password@localhost:5432/pikku_queue'

async function main(): Promise<void> {
  try {
    const pgBossQueueService = new PgBossQueueService(connectionString)
    const queueService = new PikkuQueue(pgBossQueueService)

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

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      await pgBossQueueService.close()
      process.exit(0)
    })
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
