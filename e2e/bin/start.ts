import { PikkuUWSServer } from '@pikku/uws'

import { createConfig } from '../src/config.js'
import { createSingletonServices } from '../src/services.js'
import { seedAuthUsers } from '../src/seed-auth.js'
import { startMockOAuthServer } from '../tests/support/mock-oauth-server.js'

import '../src/middleware.js'
import '../.pikku/pikku-bootstrap.gen.js'
import '../packages/functions/src/wirings/oauth2-routes.wirings.js'

async function main(): Promise<void> {
  try {
    await startMockOAuthServer()
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)
    const appServer = new PikkuUWSServer(config, singletonServices.logger)

    appServer.enableExitOnSigInt()
    await appServer.init({ exposeErrors: true })
    await appServer.start()

    const apiBase = process.env.API_URL ?? `http://localhost:${config.port}`
    await seedAuthUsers(singletonServices, apiBase)
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
