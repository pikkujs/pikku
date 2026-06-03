import { PikkuMCPServer } from '@pikku/modelcontextprotocol'
import { createSingletonServices, createConfig } from '../src/services.js'
import mcpJSON from '../.pikku/mcp/mcp.gen.json' with { type: 'json' }
import '../.pikku/pikku-bootstrap.gen.js'

async function main() {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)

  const server = new PikkuMCPServer(
    {
      name: 'pikku-functions-mcp-server',
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

  const port = parseInt(process.env.MCP_PORT || '4020', 10)
  const { close } = await server.connectHTTP({ port })

  process.on('SIGINT', async () => {
    await close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await close()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('Failed to start MCP HTTP server:', error)
  process.exit(1)
})
