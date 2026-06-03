import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  CallToolResultSchema,
  GetPromptResultSchema,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
  PingRequestSchema,
  ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

export class PikkuMCPTestClient {
  private client: Client
  private transport: Transport | undefined

  constructor(
    private serverCommand: string,
    private serverArgs: string[] = []
  ) {
    this.client = new Client(
      {
        name: 'pikku-mcp-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    )
  }

  async connect(): Promise<void> {
    this.transport = new StdioClientTransport({
      command: this.serverCommand,
      args: this.serverArgs,
    })

    await this.client.connect(this.transport)

    this.transport.onerror = (error: Error) => {
      console.error('Server process error:', error)
    }
  }

  async connectHTTP(url: string): Promise<void> {
    this.transport = new StreamableHTTPClientTransport(new URL(url))
    await this.client.connect(this.transport)
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.client.close()
    }
  }

  async listTools(): Promise<any> {
    return await this.client.request(
      {
        method: 'tools/list',
      },
      ListToolsResultSchema
    )
  }

  async callTool(name: string, args: any = {}): Promise<any> {
    return await this.client.request(
      {
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      },
      CallToolResultSchema
    )
  }

  async listResources(): Promise<any> {
    return await this.client.request(
      {
        method: 'resources/list',
      },
      ListResourcesResultSchema
    )
  }

  async listResourceTemplates(): Promise<any> {
    return await this.client.request(
      {
        method: 'resources/templates/list',
      },
      ListResourceTemplatesResultSchema
    )
  }

  async readResource(uri: string, args: any = {}): Promise<any> {
    return await this.client.request(
      {
        method: 'resources/read',
        params: {
          uri,
          arguments: args,
        },
      },
      ReadResourceResultSchema
    )
  }

  async listPrompts(): Promise<any> {
    return await this.client.request(
      {
        method: 'prompts/list',
      },
      ListPromptsResultSchema
    )
  }

  async getPrompt(name: string, args: any = {}): Promise<any> {
    return await this.client.request(
      {
        method: 'prompts/get',
        params: {
          name,
          arguments: args,
        },
      },
      GetPromptResultSchema
    )
  }

  async ping(): Promise<any> {
    return await this.client.request(
      {
        method: 'ping',
      },
      PingRequestSchema
    )
  }

  async runFullTest(): Promise<void> {
    console.log('Starting MCP test client')

    try {
      try {
        await this.ping()
      } catch {}

      const tools = await this.listTools()
      if (!tools.tools?.length) {
        throw new Error('No MCP tools registered')
      }

      const toolResult = await this.callTool(tools.tools[0].name, {
        title: 'Test todo',
      })
      if (toolResult.isError) {
        throw new Error(
          `Tool call returned error: ${toolResult.content?.[0]?.text}`
        )
      }

      await this.listResources()
      const resourceTemplates = await this.listResourceTemplates()
      if (!resourceTemplates.resourceTemplates?.length) {
        throw new Error('No MCP resource templates registered')
      }

      const resourceResult = await this.readResource('todos/todo1')
      if (!resourceResult.contents?.length) {
        throw new Error('Resource read returned no contents')
      }

      const prompts = await this.listPrompts()
      if (!prompts.prompts?.length) {
        throw new Error('No MCP prompts registered')
      }

      await this.getPrompt(prompts.prompts[0].name, {
        userId: 'user1',
      })

      console.log('MCP test passed')
    } catch (error) {
      console.error('MCP test failed:', error)
      throw error
    }
  }
}

export async function runMCPHTTPClientTest(url: string): Promise<void> {
  const client = new PikkuMCPTestClient('', [])

  try {
    await client.connectHTTP(url)
    await client.runFullTest()
  } finally {
    await client.disconnect()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new PikkuMCPTestClient('yarn', ['run', 'start:mcp:http'])
  try {
    await client.connect()
    await client.runFullTest()
  } finally {
    await client.disconnect()
  }
}
