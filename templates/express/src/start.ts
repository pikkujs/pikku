import { PikkuExpressServer } from '@pikku/express'
import { PikkuTaskScheduler } from '@pikku/schedule'
import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from '../../functions/src/services.js'
import { ScheduledTaskNames } from '../../functions/.pikku/pikku-schedules.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)

    const appServer = new PikkuExpressServer(
      { ...config, port: 4002, hostname: 'localhost' },
      singletonServices,
      createSessionServices
    )
    appServer.enableExitOnSigInt()
    await appServer.init()
    await appServer.start()

    const scheduler = new PikkuTaskScheduler<ScheduledTaskNames>(
      singletonServices
    )
    scheduler.startAll()
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
