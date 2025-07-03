import { PgBossQueueWorkers, PgBossQueueService } from '@pikku/queue-pg-boss'
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
    singletonServices.logger.info('Starting pg-boss queue adaptor...')

    // Use DATABASE_URL environment variable or provide a connection string
    const connectionString =
      process.env.DATABASE_URL ||
      'postgres://postgres:password@localhost:5432/pikku_queue'

    const pgBossQueueWorkers = new PgBossQueueWorkers(
      connectionString,
      singletonServices,
      createSessionServices
    )

    // Initialize pg-boss
    await pgBossQueueWorkers.init()

    // Register queue processors
    await pgBossQueueWorkers.registerQueues()

    const pgBossQueueService = new PgBossQueueService(connectionString)
    await pgBossQueueService.init()

    setTimeout(async () => {
      const jobId = await pgBossQueueService.add('hello-world-queue', {
        message: 'Hello from pg-boss!',
        fail: false,
      })
      singletonServices.logger.info(`Queued job: ${jobId}`)

      const job = await pgBossQueueService.getJob('hello-world-queue', jobId)
      if (job) {
        console.log(await job.waitForCompletion())
      }
    }, 2000)

    setTimeout(async () => {
      const jobId = await pgBossQueueService.add('hello-world-queue', {
        message: 'Sorry in advance',
        fail: true,
      })
      singletonServices.logger.info(`Queued failing job: ${jobId}`)

      const job = await pgBossQueueService.getJob('hello-world-queue', jobId)
      if (job) {
        try {
          console.log(await job.waitForCompletion())
        } catch (error) {
          singletonServices.logger.error('Job failed as expected:', error)
        }
      }
    }, 4000)

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      singletonServices.logger.info(
        'Received SIGTERM, shutting down gracefully...'
      )
      await pgBossQueueWorkers.close()
      await pgBossQueueService.close()
      process.exit(0)
    })

    process.on('SIGINT', async () => {
      singletonServices.logger.info(
        'Received SIGINT, shutting down gracefully...'
      )
      await pgBossQueueWorkers.close()
      await pgBossQueueService.close()
      process.exit(0)
    })
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
