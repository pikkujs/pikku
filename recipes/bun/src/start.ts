import { PikkuBunServer } from '@pikku/bun-server'
import { installEventHubDistributor } from '@pikku/core/internal/event-hub'
import { InMemorySchedulerService } from '@pikku/schedule'
import { createSingletonServices } from '../../functions/src/services.js'
import { createConfig } from '../../functions/src/config.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const schedulerService = new InMemorySchedulerService()
    // Before the services, so they get the publisher; the server's sockets attach to the same hub.
    const { services: eventHubServices } = installEventHubDistributor()
    const singletonServices = await createSingletonServices(config, {
      schedulerService,
      ...eventHubServices,
    })

    const appServer = new PikkuBunServer(
      { ...config, port: 4002, hostname: 'localhost' },
      singletonServices.logger
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

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
