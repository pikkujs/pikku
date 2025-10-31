import { PikkuUWSServer } from '@pikku/uws'

import '../.pikku/pikku-bootstrap.gen.js'

// Import services from functions template
import {
  createConfig,
  createSessionServices,
  createSingletonServices,
} from '../../functions/src/services.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)
    const appServer = new PikkuUWSServer(
      { ...config, hostname: 'localhost', port: 3000 },
      singletonServices,
      createSessionServices
    )
    appServer.enableExitOnSigInt()
    await appServer.init()

    console.log('🚀 CLI WebSocket server starting on ws://localhost:3000/cli')
    await appServer.start()
    console.log(
      '✅ Server ready! Run "yarn cli:remote" in another terminal to connect.'
    )
  } catch (e: any) {
    console.error('❌ Server error:', e.toString())
    process.exit(1)
  }
}

main()
