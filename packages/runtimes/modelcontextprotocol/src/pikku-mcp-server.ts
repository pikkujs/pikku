import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourceTemplatesResult,
  ListResourcesResult,
  ListPromptsResult,
  ListToolsResult,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'

import {
  CoreConfig,
  CoreSingletonServices,
  CreateSessionServices,
  runMCPTool,
  runMCPResource,
  runMCPPrompt,
  getMCPTools,
  getMCPResources,
  getMCPResourcesMeta,
  getMCPToolsMeta,
  getMCPPromptsMeta,
  LogLevel,
  getMCPPrompts,
  MCPError,
} from '@pikku/core'

import { MCPEndpointRegistry } from './pikku-mcp-endpoint-registry.js'

export interface MCPServerConfig extends CoreConfig {
  name: string
  version: string
  mcpJsonPath: string
  capabilities?: {
    logging?: {}
    tools?: {}
    resources?: {}
    prompts?: {}
  }
}

export class PikkuMCPServer {
  private server: Server
  private mcpEndpointRegistry: MCPEndpointRegistry
  private transport: StdioServerTransport | undefined

  constructor(
    private config: MCPServerConfig,
    private singletonServices: CoreSingletonServices,
    private createSessionServices?: CreateSessionServices<any, any, any>
  ) {
    singletonServices.logger.setLevel(LogLevel.debug)
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: config.capabilities || {
          logging: {},
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    )

    this.mcpEndpointRegistry = new MCPEndpointRegistry()
  }

  async init(): Promise<void> {
    this.singletonServices.logger.info('Initializing Pikku MCP Server...')
    try {
      // Load the MCP JSON schema file
      await this.mcpEndpointRegistry.loadFromMCPJson(this.config.mcpJsonPath)
      this.singletonServices.logger.info(
        `Loaded MCP tools from ${this.config.mcpJsonPath}`
      )

      const resources = getMCPResources()
      const resourcesMeta = getMCPResourcesMeta()
      this.mcpEndpointRegistry.setResourcesMeta(resourcesMeta)
      this.singletonServices.logger.info(
        `Registered resources: ${Array.from(resources.keys()).join(', ')}`
      )
      this.setupResources()

      const tools = getMCPTools()
      const toolsMeta = getMCPToolsMeta()
      this.mcpEndpointRegistry.setToolsMeta(toolsMeta)
      this.singletonServices.logger.info(
        `Registered tools: ${Array.from(tools.keys()).join(', ')}`
      )
      this.setupTools()

      const prompts = getMCPPrompts()
      const promptsMeta = getMCPPromptsMeta()
      this.mcpEndpointRegistry.setPromptsMeta(promptsMeta)
      this.setupPrompts()

      this.singletonServices.logger.info(
        `Found ${Object.keys(prompts).length} MCP prompts`
      )
    } catch (error) {
      this.singletonServices.logger.error(
        'Failed to initialize MCP server:',
        error
      )
      throw error
    }
  }

  async start(): Promise<void> {
    this.singletonServices.logger.info('Starting Pikku MCP Server...')

    try {
      this.transport = new StdioServerTransport()
      await this.server.connect(this.transport)

      this.singletonServices.logger.info(
        'Pikku MCP Server started successfully'
      )
    } catch (error) {
      this.singletonServices.logger.error('Failed to start MCP server:', error)
      throw error
    }
  }

  async stop(): Promise<void> {
    this.singletonServices.logger.info('Stopping Pikku MCP Server...')

    try {
      if (this.transport) {
        await this.server.close()
      }

      this.singletonServices.logger.info(
        'Pikku MCP Server stopped successfully'
      )
    } catch (error) {
      this.singletonServices.logger.error('Error stopping MCP server:', error)
      throw error
    }
  }

  private setupTools(): void {
    const tools = Object.values(this.mcpEndpointRegistry.getTools())
    if (tools.length > 0) {
      // Handler for listing available tools
      this.server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        } as ListToolsResult
      })
    }

    // Handler for calling tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      const result = await runMCPTool(
        {
          jsonrpc: '2.0' as const,
          id: Date.now().toString(),
          params: args || {},
        },
        {
          singletonServices: this.singletonServices,
          createSessionServices: this.createSessionServices,
        },
        name
      )
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.result, null, 2),
          },
        ],
      }
    })
  }

  private setupResources(): void {
    const resourceTemplates = Object.values(
      this.mcpEndpointRegistry.getResources()
    ).filter((resource) => resource.inputSchema)

    if (resourceTemplates.length > 0) {
      this.server.setRequestHandler(
        ListResourceTemplatesRequestSchema,
        async () => {
          return {
            resourceTemplates: resourceTemplates.map((resource) => ({
              name: resource.uri,
              uriTemplate: resource.uri,
              title: resource.title,
              description: resource.description,
              mimeType: 'application/json',
            })),
          } as ListResourceTemplatesResult
        }
      )
    }

    const resources = Object.values(getMCPResourcesMeta()).filter(
      (resource) => !resource.inputSchema
    )

    if (resources.length > 0) {
      this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
          resources: resources.map((resource) => ({
            name: resource.title,
            uri: resource.uri,
            title: resource.title,
            description: resource.description,
            mimeType: 'application/json',
          })),
        } as ListResourcesResult
      })
    }

    if (resourceTemplates.length > 0 || resources.length > 0) {
      this.server.setRequestHandler(
        ReadResourceRequestSchema,
        async (request) => {
          const { uri, arguments: args } = request.params
          try {
            const result = await runMCPResource(
              {
                jsonrpc: '2.0' as const,
                id: Date.now().toString(),
                params: args || {},
              },
              {
                singletonServices: this.singletonServices,
                createSessionServices: this.createSessionServices,
              },
              uri
            )
            return {
              contents: [
                {
                  uri,
                  text: JSON.stringify(result.result),
                  mimeType: 'application/json',
                },
              ],
            }
          } catch (error: unknown) {
            if (error instanceof MCPError) {
              const { code, message, data } = error.error
              this.server.sendLoggingMessage({
                level: 'error',
                message: `Error reading resource ${uri}: code ${code}: ${message}`,
                data: { uri, error },
              })
              throw new McpError(code, message, data)
            }

            this.server.sendLoggingMessage({
              level: 'error',
              message: `Error reading resource ${uri}: ${error instanceof Error ? error.message : String(error)}`,
              data: { uri, error },
            })
            throw error
          }
        }
      )
    }
  }

  private setupPrompts(): void {
    const promptsMeta = Object.values(getMCPPromptsMeta())
    if (promptsMeta.length > 0) {
      // Handler for listing available prompts
      this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
        return {
          prompts: promptsMeta.map((prompt) => ({
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments || [],
          })),
        } as ListPromptsResult
      })
      // Handler for getting specific prompt
      this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const { name, arguments: args } = request.params
        const promptMeta = getMCPPromptsMeta()[name]

        if (!promptMeta) {
          throw new Error(`Prompt not found: ${name}`)
        }

        const result = await runMCPPrompt(
          {
            jsonrpc: '2.0' as const,
            id: Date.now().toString(),
            params: args || {},
          },
          {
            singletonServices: this.singletonServices,
            createSessionServices: this.createSessionServices,
          },
          name
        )

        return {
          messages: result.result,
        }
      })
    }
  }
}
