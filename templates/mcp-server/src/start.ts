#!/usr/bin/env node

import { PikkuMCPServer } from '@pikku/modelcontextprotocol'
import {
  createSingletonServices,
  createConfig,
} from '../../functions/src/services.js'

import '../../functions/.pikku/mcp.gen.json' with { type: 'json' }
import '../../functions/.pikku/mcp/pikku-bootstrap-mcp.gen.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
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
        mcpJsonPath: join(
          __dirname,
          process.env.MCP_JSON_PATH || '../../functions/.pikku/mcp.gen.json'
        ),
        capabilities: {
          logging: {},
          tools: {},
          resources: {},
          prompts: {},
        },
      },
      singletonServices
    )

    await server.init()

    try {
      const transport = new StdioServerTransport()
      await server.connect(transport)
      server.wrapLogger()
      process.on('SIGINT', async () => {
        await transport?.close()
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
