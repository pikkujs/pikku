import { PgBossServiceFactory } from '@pikku/queue-pg-boss'
import { createFunctionRunner, stopSingletonServices } from '@pikku/core'
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
    singletonServices.logger.info('Starting pg-boss queue adaptor...')

    const connectionString =
      process.env.DATABASE_URL ||
      'postgres://postgres:password@localhost:5432/pikku_queue'

    const pgBossFactory = new PgBossServiceFactory(connectionString)
    await pgBossFactory.init()
    const runFunction = createFunctionRunner(
      singletonServices,
      createWireServices
    )

    const pgBossQueueWorkers = pgBossFactory.getQueueWorkers(
      runFunction,
      singletonServices.logger
    )

    await pgBossQueueWorkers.registerQueues()

    const shutdown = async (signal: string) => {
      singletonServices.logger.info(
        `Received ${signal}, shutting down gracefully...`
      )
      await pgBossFactory.close()
      await stopSingletonServices(singletonServices)
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
