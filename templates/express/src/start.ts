import { PikkuExpressServer } from '@pikku/express'
import { InMemorySchedulerService } from '@pikku/schedule'
import { createSchedulerRuntimeHandlers } from '@pikku/core/scheduler'
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

    const appServer = new PikkuExpressServer(
      { ...config, port: 4002, hostname: 'localhost' },
      singletonServices,
      createWireServices
    )
    appServer.enableExitOnSigInt()
    await appServer.init()
    await appServer.start()

    const scheduler = new InMemorySchedulerService()
    scheduler.setServices(
      createSchedulerRuntimeHandlers({
        singletonServices,
        createWireServices,
      })
    )
    await scheduler.start()
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
