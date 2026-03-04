import { PikkuUWSServer } from '@pikku/uws'

import { createConfig } from '../src/config.js'
import { createSingletonServices } from '../src/services.js'

import '../src/middleware.js'
import '../.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)
    const appServer = new PikkuUWSServer(config, singletonServices.logger)

    appServer.enableExitOnSigInt()
    await appServer.init({ exposeErrors: true })
    await appServer.start()
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
