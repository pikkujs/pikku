import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
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
  LogLevel,
  Logger,
} from '@pikku/core'

import {
  MCPEndpointRegistry,
  PikkuMCP,
  MCPError,
  runMCPTool,
  runMCPResource,
  runMCPPrompt,
  getMCPResourcesMeta,
  getMCPToolsMeta,
  getMCPPromptsMeta,
} from '@pikku/core/mcp'

export interface MCPServerConfig extends CoreConfig {
  name: string
  version: string
  mcpJsonPath: string
  capabilities: Partial<{
    logging: {}
    tools: {}
    resources: {}
    prompts: {}
  }>
}

export class PikkuMCPServer {
  private server: Server
  private mcpEndpointRegistry: MCPEndpointRegistry

  constructor(
    private config: MCPServerConfig,
    private singletonServices: CoreSingletonServices,
    private createSessionServices:
      | CreateSessionServices<any, any, any>
      | undefined = undefined
  ) {
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: config.capabilities,
      }
    )

    this.mcpEndpointRegistry = new MCPEndpointRegistry()
  }

  async init(): Promise<void> {
    try {
      // Load the MCP JSON schema file
      await this.mcpEndpointRegistry.loadFromMCPJsonFile(
        this.config.mcpJsonPath
      )
      if (this.config.capabilities.resources) {
        const resourcesMeta = getMCPResourcesMeta()
        this.mcpEndpointRegistry.setResourcesMeta(resourcesMeta)
        this.setupResources()
      }

      if (this.config.capabilities.tools) {
        const toolsMeta = getMCPToolsMeta()
        this.mcpEndpointRegistry.setToolsMeta(toolsMeta)
        this.setupTools()
      }

      if (this.config.capabilities.prompts) {
        const promptsMeta = getMCPPromptsMeta()
        this.mcpEndpointRegistry.setPromptsMeta(promptsMeta)
        this.setupPrompts()
      }
    } catch (error) {
      this.singletonServices.logger.error(
        'Failed to initialize MCP server:',
        error
      )
      throw error
    }
  }

  public async stop(): Promise<void> {
    await this.server.close()
  }

  public async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport)
  }

  public async wrapLogger(): Promise<void> {
    const server = this.server
    const logger: Logger = {
      info: function (
        messageOrObj: string | Record<string, any>,
        ...meta: any[]
      ): void {
        server.sendLoggingMessage({
          level: 'info',
          message:
            typeof messageOrObj === 'string'
              ? messageOrObj
              : JSON.stringify(messageOrObj),
          data: meta.length > 0 ? meta : undefined,
        })
      },
      warn: function (
        messageOrObj: string | Record<string, any>,
        ...meta: any[]
      ): void {
        server.sendLoggingMessage({
          level: 'warning',
          message:
            typeof messageOrObj === 'string'
              ? messageOrObj
              : JSON.stringify(messageOrObj),
          data: meta.length > 0 ? meta : undefined,
        })
      },
      error: function (
        messageOrObj: string | Record<string, any> | Error,
        ...meta: any[]
      ): void {
        server.sendLoggingMessage({
          level: 'error',
          message:
            typeof messageOrObj === 'string'
              ? messageOrObj
              : JSON.stringify(messageOrObj),
          data: meta.length > 0 ? meta : undefined,
        })
      },
      debug: function (message: string, ...meta: any[]): void {
        server.sendLoggingMessage({
          level: 'debug',
          message,
          data: meta.length > 0 ? meta : undefined,
        })
      },
      setLevel: function (level: LogLevel): void {
        throw new Error('Function not implemented.')
      },
    }

    this.singletonServices = {
      ...this.singletonServices,
      logger,
    }
  }

  private setupTools(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = Object.values(this.mcpEndpointRegistry.getTools())
      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      } as ListToolsResult
    })

    const mcpEndpointRegistry = this.mcpEndpointRegistry
    const server = this.server
    const mcp: PikkuMCP = {
      sendResourceUpdated: async function (uri: string) {
        await server.sendResourceUpdated({ uri })
      },
      enableTools: async function (tools: Record<any, boolean>) {
        const changed = mcpEndpointRegistry.enableTools(tools)
        if (changed) {
          await server.sendToolListChanged()
        }
        return changed
      },
      enablePrompts: async function (tools: Record<any, boolean>) {
        const changed = mcpEndpointRegistry.enableTools(tools)
        if (changed) {
          await server.sendPromptListChanged()
        }
        return changed
      },
      enableResources: async function (tools: Record<any, boolean>) {
        const changed = mcpEndpointRegistry.enableResources(tools)
        if (changed) {
          await server.sendResourceListChanged()
        }
        return changed
      },
      // elicitInput: async function (message: string) {
      //   // TODO: We need to implement a way to get a reference to the schema the user requested..
      //   return await server.elicitInput({
      //     message,
      //     requestedSchema: '' as any
      //   })
      // }
    }

    // Handler for calling tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      try {
        const result = await runMCPTool(
          {
            jsonrpc: '2.0' as const,
            id: Date.now().toString(),
            params: args || {},
          },
          {
            singletonServices: this.singletonServices,
            createSessionServices: this.createSessionServices,
            mcp,
          },
          name
        )
        return {
          isError: false,
          content: result.result,
        }
      } catch (e: unknown) {
        if (e instanceof MCPError) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify(e.error),
              },
            ],
          }
        }
        throw new McpError(-32603, 'Internal error', {
          message: e instanceof Error ? e.message : String(e),
        })
      }
    })
  }

  private setupResources(): void {
    this.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async () => {
        const resourceTemplates = Object.values(
          this.mcpEndpointRegistry.getResources()
        ).filter((resource) => resource.inputSchema)
        return {
          resourceTemplates: resourceTemplates.map((resource) => ({
            name: resource.uri,
            uriTemplate: resource.uri,
            title: resource.title,
            description: resource.description,
            mimeType: resource.mimeType,
          })),
        } as ListResourceTemplatesResult
      }
    )

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = Object.values(getMCPResourcesMeta()).filter(
        (resource) => !resource.inputSchema
      )
      return {
        resources: resources.map((resource) => ({
          name: resource.title,
          uri: resource.uri,
          title: resource.title,
          description: resource.description,
          mimeType: resource.mimeType,
        })),
      } as ListResourcesResult
    })

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const { uri, arguments: args } = request.params
        try {
          const { result: contents } = await runMCPResource(
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
            contents,
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

  private setupPrompts(): void {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      const promptsMeta = Object.values(getMCPPromptsMeta())
      return {
        prompts: promptsMeta.map((prompt) => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments || [],
        })),
      } as ListPromptsResult
    })

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
