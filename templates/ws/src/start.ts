import { pikkuWebsocketHandler } from '@pikku/ws'
import { stopSingletonServices } from '@pikku/core'

import { Server } from 'http'
import { WebSocketServer } from 'ws'

import '../../functions/.pikku/pikku-bootstrap.gen.js'
import {
  createConfig,
  createWireServices,
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
      createWireServices,
    })

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

    process.removeAllListeners('SIGINT').on('SIGINT', async () => {
      console.log('Stopping server...')
      await stopSingletonServices(singletonServices)
      wss.close()
      server.close()
      console.log('Server stopped')
      process.exit(0)
    })
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
