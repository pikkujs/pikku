import { PikkuUWSServer } from '@pikku/uws'
import { createConfig, createSingletonServices } from './services.js'

import '../.pikku/pikku-bootstrap.gen.js'
import './rpc.wiring.js'

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)
  const appServer = new PikkuUWSServer(config, singletonServices.logger)

  appServer.enableExitOnSigInt()
  await appServer.init({ exposeErrors: true })
  await appServer.start()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
