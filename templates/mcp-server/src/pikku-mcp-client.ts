import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
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

export class PikkuMCPTestClient {
  private client: Client
  private transport: StdioClientTransport | undefined

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
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    )
  }

  async connect(): Promise<void> {
    // Create transport using the server process stdio
    this.transport = new StdioClientTransport({
      command: this.serverCommand,
      args: this.serverArgs,
    })

    // Connect to the server
    await this.client.connect(this.transport)

    // Handle server process errors
    this.transport.onerror = (error: Error) => {
      console.error('Server process error:', error)
    }
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

  // Helper method to run a comprehensive test
  async runFullTest(): Promise<void> {
    console.log('🚀 Starting MCP Server Test Client')

    try {
      // Test ping
      console.log('\n📡 Testing ping...')
      try {
        const pingResult = await this.ping()
        console.log('✅ Ping successful:', pingResult)
      } catch (error) {
        console.log('ℹ️  Ping not supported (expected for some servers)')
      }

      // Test listing tools
      console.log('\n🔧 Testing tools...')
      const tools = await this.listTools()
      console.log('✅ Tools listed:', tools)

      // Test calling a tool if any exist
      if (tools.tools && tools.tools.length > 0) {
        const firstTool = tools.tools[0]
        console.log(`\n🔧 Testing tool call: ${firstTool.name}`)
        try {
          const toolResult = await this.callTool(firstTool.name, {})
          console.log('✅ Tool call successful:', toolResult)
        } catch (error) {
          console.log('❌ Tool call failed:', error)
        }
      }

      // Test listing resources
      console.log('\n📚 Testing resources...')
      const resources = await this.listResources()
      console.log('✅ Resources listed:', resources)

      // Test listing resource templates
      console.log('\n📋 Testing resource templates...')
      const resourceTemplates = await this.listResourceTemplates()
      console.log('✅ Resource templates listed:', resourceTemplates)

      // Test reading a resource if any exist
      if (resources.resources && resources.resources.length > 0) {
        const firstResource = resources.resources[0]
        console.log(`\n📚 Testing resource read: ${firstResource.uri}`)
        try {
          const resourceResult = await this.readResource(firstResource.uri, {})
          console.log('✅ Resource read successful:', resourceResult)
        } catch (error) {
          console.log('❌ Resource read failed:', error)
        }
      }

      // Test listing prompts
      console.log('\n💭 Testing prompts...')
      const prompts = await this.listPrompts()
      console.log('✅ Prompts listed:', prompts)

      // Test getting a prompt if any exist
      if (prompts.prompts && prompts.prompts.length > 0) {
        const firstPrompt = prompts.prompts[0]
        console.log(`\n💭 Testing prompt get: ${firstPrompt.name}`)
        try {
          const promptResult = await this.getPrompt(firstPrompt.name, {})
          console.log('✅ Prompt get successful:', promptResult)
        } catch (error) {
          console.log('❌ Prompt get failed:', error)
        }
      }

      console.log('\n✅ All tests completed successfully!')
    } catch (error) {
      console.error('❌ Test failed:', error)
      throw error
    }
  }
}

// Example usage function
export async function runMCPClientTest(
  serverCommand: string,
  serverArgs: string[] = []
): Promise<void> {
  const client = new PikkuMCPTestClient(serverCommand, serverArgs)

  try {
    await client.connect()
    await client.runFullTest()
  } catch (error) {
    console.error('❌ Test failed:', error)
  } finally {
    await client.disconnect()
  }
}
