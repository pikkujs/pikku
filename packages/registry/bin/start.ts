import { PikkuUWSServer } from '@pikku/uws'

import { createConfig } from '../src/config.js'
import { createSingletonServices } from '../src/services.js'

import '../.pikku/pikku-bootstrap.gen.js'
import '../src/middleware.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)
    const appServer = new PikkuUWSServer(config, singletonServices.logger)

    appServer.enableExitOnSigInt()
    await appServer.init()
    await appServer.start()
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
