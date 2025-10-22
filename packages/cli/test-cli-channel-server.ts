/**
 * Test server for CLI over WebSocket channel
 */
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { pikkuWebsocketHandler } from '@pikku/ws'
// Import bootstrap (loads all metadata)
import './.pikku/pikku-bootstrap.gen.js'
// Import channel wiring (this registers the /cli/pikku WebSocket channel)
import './.pikku/cli/pikku-cli-channel.gen.js'
import { createSingletonServices } from './src/services.js'

const PORT = 3456

async function startServer() {
  const server = createServer()
  const wss = new WebSocketServer({ noServer: true })

  // Create singleton services once for the server
  const services = await createSingletonServices({
    configFile: './pikku.config.json',
  })

  console.log('Starting CLI channel test server...')

  // Set up Pikku WebSocket handler
  pikkuWebsocketHandler({
    server,
    wss,
    singletonServices: services,
    createSessionServices: async () => ({}),
    logRoutes: true,
    loadSchemas: false,
  })

  server.listen(PORT, () => {
    console.log(`\n✓ CLI Channel Server listening on http://localhost:${PORT}`)
    console.log(`✓ CLI Channel available at ws://localhost:${PORT}/cli/pikku\n`)
    console.log('To test, run in another terminal:')
    console.log(`  yarn tsx .pikku/cli/pikku-cli-client.gen.ts schemas`)
    console.log('  or')
    console.log(
      `  PIKKU_WS_URL=ws://localhost:${PORT}/cli/pikku yarn tsx .pikku/cli/pikku-cli-client.gen.ts --help`
    )
  })
}

startServer().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
