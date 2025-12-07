import { PikkuUWSServer } from '@pikku/uws'

import '#pikku/pikku-bootstrap.gen.js'

// Import services from functions template
import {
  createConfig,
  createWireServices,
  createSingletonServices,
} from '../../functions/src/services.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)
    const appServer = new PikkuUWSServer(
      { ...config, hostname: 'localhost', port: 4002 },
      singletonServices,
      createWireServices
    )
    appServer.enableExitOnSigInt()
    await appServer.init()

    console.log('🚀 CLI WebSocket server starting on ws://localhost:4002/cli')
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
