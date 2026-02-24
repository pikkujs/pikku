#!/usr/bin/env node

import { PikkuMCPServer } from '@pikku/modelcontextprotocol'
import {
  createSingletonServices,
  createConfig,
} from '../../functions/src/services.js'

import mcpJSON from '../../functions/.pikku/mcp/mcp.gen.json' with { type: 'json' }
import '../../functions/.pikku/pikku-bootstrap.gen.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

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

    try {
      const transport = new StdioServerTransport()
      await server.connect(transport)
      singletonServices.logger = server.createMCPLogger()
      process.on('SIGINT', async () => {
        await server.stop()
        process.exit(0)
      })
    } catch (error) {
      throw error
    }
  } catch (error) {
    console.error('Failed to start MCP server:', error)
    process.exit(1)
  }
}

main()
