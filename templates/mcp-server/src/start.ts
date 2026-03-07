#!/usr/bin/env node

import { PikkuMCPServer } from '@pikku/modelcontextprotocol'
import {
  createSingletonServices,
  createConfig,
} from '../../functions/src/services.js'

import mcpJSON from '../../functions/.pikku/mcp/mcp.gen.json' with { type: 'json' }
import '../../functions/.pikku/pikku-bootstrap.gen.js'

async function main() {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)

    const server = new PikkuMCPServer(
      {
        name: 'pikku-mcp-server',
        version: '1.0.0',
        mcpJSON,
        capabilities: {
          logging: {},
          tools: {},
          resources: {},
          prompts: {},
        },
      },
      singletonServices.logger
    )

    await server.init()

    const useHTTP = process.argv.includes('--http')

    if (useHTTP) {
      const port = parseInt(process.env.MCP_PORT || '3000', 10)
      const { close } = await server.connectHTTP({ port })
      singletonServices.logger = server.createMCPLogger()
      process.on('SIGINT', async () => {
        await close()
        process.exit(0)
      })
    } else {
      await server.connectStdio()
      singletonServices.logger = server.createMCPLogger()
      process.on('SIGINT', async () => {
        await server.stop()
        process.exit(0)
      })
    }
  } catch (error) {
    console.error('Failed to start MCP server:', error)
    process.exit(1)
  }
}

main()
