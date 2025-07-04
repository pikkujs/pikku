import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import {
  CoreConfig,
  CoreSingletonServices,
  CreateSessionServices,
  runMCPEndpointJsonRpc,
  getMCPEndpoints,
  getMCPEndpointsMeta,
  LogLevel,
} from '@pikku/core'

import { MCPToolRegistry } from './mcp-tool-registry.js'

export interface MCPServerConfig extends CoreConfig {
  name: string
  version: string
  mcpJsonPath: string
  capabilities?: {
    tools?: {}
    resources?: {}
  }
}

export class PikkuMCPServer {
  private server: Server
  private toolRegistry: MCPToolRegistry
  private transport: StdioServerTransport | undefined

  constructor(
    private config: MCPServerConfig,
    private singletonServices: CoreSingletonServices,
    private createSessionServices?: CreateSessionServices<any, any, any>
  ) {
    singletonServices.logger.setLevel(LogLevel.critical)
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: config.capabilities || { tools: {}, resources: {} },
      }
    )

    this.toolRegistry = new MCPToolRegistry()
  }

  async init(): Promise<void> {
    this.singletonServices.logger.info('Initializing Pikku MCP Server...')
    try {
      // Load the MCP JSON schema file
      await this.toolRegistry.loadFromMCPJson(this.config.mcpJsonPath)
      this.singletonServices.logger.info(
        `Loaded MCP tools from ${this.config.mcpJsonPath}`
      )
      // Get the endpoints meta from Pikku state (assumes bootstrap was imported by user)
      const endpointsMeta = getMCPEndpointsMeta()
      const endpoints = getMCPEndpoints()
      this.toolRegistry.setEndpointsMeta(endpointsMeta)

      this.singletonServices.logger.info(
        `Found ${Object.keys(endpointsMeta).length} MCP endpoints`
      )
      this.singletonServices.logger.info(
        `Registered endpoints: ${Array.from(endpoints.keys()).join(', ')}`
      )

      this.setupRequestHandlers()
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

  private setupRequestHandlers(): void {
    // Handler for listing available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.toolRegistry.getTools().map((tool) => ({
          title: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema || {
            type: 'object',
            properties: {},
          },
          outputSchema: tool.outputSchema || {
            type: 'object',
            properties: {},
          },
        })),
      }
    })

    // Handler for calling tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      // Convert MCP request to Pikku's JSON-RPC format
      const jsonRpcRequest = {
        jsonrpc: '2.0' as const,
        id: Date.now().toString(),
        method: name,
        params: args || {},
      }
      return await runMCPEndpointJsonRpc(jsonRpcRequest, {
        singletonServices: this.singletonServices,
        createSessionServices: this.createSessionServices,
      })
    })

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: this.toolRegistry.getResources().map((resource) => ({
          uri: resource.name,
          name: resource.name,
          description: resource.description,
          inputSchema: resource.inputSchema || {
            type: 'object',
            properties: {},
          },
          outputSchema: resource.outputSchema || {
            type: 'object',
            properties: {},
          },
        })),
      }
    })

    // Handler for calling tools
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const { uri, arguments: args } = request.params
        // Convert MCP request to Pikku's JSON-RPC format
        const jsonRpcRequest = {
          jsonrpc: '2.0' as const,
          id: Date.now().toString(),
          method: uri,
          params: args || {},
        }
        const result = JSON.stringify(
          await runMCPEndpointJsonRpc(jsonRpcRequest, {
            singletonServices: this.singletonServices,
            createSessionServices: this.createSessionServices,
          })
        )
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: result,
            },
          ],
        }
      }
    )
  }
}
