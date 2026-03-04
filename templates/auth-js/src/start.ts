import { PikkuExpressServer } from '@pikku/express'
import { createConfig, createSingletonServices } from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'
import './wirings/auth.wiring.js'
import './middleware.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)

    const appServer = new PikkuExpressServer(
      { ...config, port: 4003, hostname: 'localhost' },
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
