#!/usr/bin/env node

import { PikkuMCPServer } from '@pikku/mcp-server'
import {
  createSingletonServices,
  createConfig,
} from '../../functions/src/services.js'

import '../../functions/.pikku/mcp/pikku-bootstrap-mcp.gen.js'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function main() {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)

    const server = new PikkuMCPServer(
      {
        name: 'pikku-mcp-server',
        version: '1.0.0',
        mcpJsonPath: join(__dirname, '../../functions/.pikku/mcp.gen.json'),
      },
      singletonServices
    )

    await server.init()
    await server.start()

    // Keep the process running
    process.on('SIGINT', async () => {
      await server.stop()
      process.exit(0)
    })
  } catch (error) {
    console.error('Failed to start MCP server:', error)
    process.exit(1)
  }
}

main()
