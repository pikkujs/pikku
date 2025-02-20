import { pikkuWebsocketHandler } from '@pikku/ws'

import { Server } from 'http'
import { WebSocketServer } from 'ws'
import {
  createConfig,
  createSessionServices,
  createSingletonServices,
} from '../../functions/src/services.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)
    const server = new Server()
    const wss = new WebSocketServer({ noServer: true })
    pikkuWebsocketHandler({
      server,
      wss,
      singletonServices,
      createSessionServices,
    })

    // Add /health-check endpoint
    server.on('request', (req, res) => {
      if (req.method === 'GET' && req.url === '/health-check') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
      }
    })

    const port = 4002
    const hostname = 'localhost'
    server.listen(port, hostname, () => {
      console.log(`Server running at http://${hostname}:${port}/`)
    })
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
