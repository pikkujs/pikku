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
    console.log('🚀 Starting MCP Server Test Client')

    try {
      console.log('\n📡 Testing ping...')
      try {
        const pingResult = await this.ping()
        console.log('✅ Ping successful:', pingResult)
      } catch {
        console.log('ℹ️  Ping not supported (expected for some servers)')
      }

      console.log('\n🔧 Testing tools...')
      const tools = await this.listTools()
      console.log('✅ Tools listed:', tools)

      if (tools.tools && tools.tools.length > 0) {
        const firstTool = tools.tools[0]
        console.log(`\n🔧 Testing tool call: ${firstTool.name}`)
        const toolResult = await this.callTool(firstTool.name, {
          title: 'Test todo',
        })
        if (toolResult.isError) {
          throw new Error(
            `Tool call returned error: ${toolResult.content?.[0]?.text}`
          )
        }
        console.log('✅ Tool call successful:', toolResult)
      }

      console.log('\n📚 Testing resources...')
      const resources = await this.listResources()
      console.log('✅ Resources listed:', resources)

      console.log('\n📋 Testing resource templates...')
      const resourceTemplates = await this.listResourceTemplates()
      console.log('✅ Resource templates listed:', resourceTemplates)

      if (resources.resources && resources.resources.length > 0) {
        const firstResource = resources.resources[0]
        console.log(`\n📚 Testing resource read: ${firstResource.uri}`)
        const resourceResult = await this.readResource(firstResource.uri, {})
        console.log('✅ Resource read successful:', resourceResult)
      }

      console.log('\n💭 Testing prompts...')
      const prompts = await this.listPrompts()
      console.log('✅ Prompts listed:', prompts)

      if (prompts.prompts && prompts.prompts.length > 0) {
        const firstPrompt = prompts.prompts[0]
        console.log(`\n💭 Testing prompt get: ${firstPrompt.name}`)
        const promptResult = await this.getPrompt(firstPrompt.name, {
          userId: 'user1',
        })
        console.log('✅ Prompt get successful:', promptResult)
      }

      console.log('\n✅ All tests completed successfully!')
    } catch (error) {
      console.error('❌ Test failed:', error)
      throw error
    }
  }
}

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
    throw error
  } finally {
    await client.disconnect()
  }
}

export async function runMCPHTTPClientTest(url: string): Promise<void> {
  const client = new PikkuMCPTestClient('', [])

  try {
    await client.connectHTTP(url)
    await client.runFullTest()
  } catch (error) {
    console.error('❌ HTTP Test failed:', error)
    throw error
  } finally {
    await client.disconnect()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runMCPClientTest('npx', ['tsx', 'src/start.ts'])
}
