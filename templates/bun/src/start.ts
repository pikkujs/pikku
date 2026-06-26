import { PikkuBunServer, BunEventHubService } from '@pikku/bun-server'
import { InMemorySchedulerService } from '@pikku/schedule'
import {
  createConfig,
  createSingletonServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const schedulerService = new InMemorySchedulerService()
    const eventHub = new BunEventHubService()
    const singletonServices = await createSingletonServices(config, {
      schedulerService,
      eventHub,
    })

    const appServer = new PikkuBunServer(
      { ...config, port: 4002, hostname: 'localhost' },
      singletonServices.logger,
      { eventHub }
    )
    appServer.enableExitOnSignals()
    await appServer.init()
    await appServer.start()

    await schedulerService.start()
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
