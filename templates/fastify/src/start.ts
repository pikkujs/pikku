import { PikkuFastifyServer } from '@pikku/fastify'

import '#pikku/pikku-bootstrap.gen.js'
import { createSingletonServices } from '../../functions/src/services.js'
import { createConfig } from '../../functions/src/config.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)
    const appServer = new PikkuFastifyServer(
      { ...config, hostname: 'localhost', port: 4002 },
      singletonServices.logger
    )
    appServer.enableExitOnSigInt()
    await appServer.init()
    await appServer.start()
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
