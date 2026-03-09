import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type {
  ListResourceTemplatesResult,
  ListResourcesResult,
  ListPromptsResult,
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js'
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js'

import type { CoreConfig } from '@pikku/core'
import { stopSingletonServices } from '@pikku/core'
import type { Logger } from '@pikku/core/services'

import type { PikkuMCP } from '@pikku/core/mcp'
import {
  MCPEndpointRegistry,
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
  mcpJSON: any
  capabilities: Partial<{
    logging: {}
    tools: {}
    resources: {}
    prompts: {}
  }>
}

export interface MCPHttpOptions {
  port?: number
  host?: string
  path?: string
}

export class PikkuMCPServer {
  private server!: Server
  private mcpEndpointRegistry: MCPEndpointRegistry
  private sessions = new Map<
    string,
    { server: Server; transport: StreamableHTTPServerTransport }
  >()
  private connected = false

  constructor(
    private config: MCPServerConfig,
    private logger: Logger
  ) {
    this.mcpEndpointRegistry = new MCPEndpointRegistry()
  }

  async init(): Promise<void> {
    try {
      // Load the MCP JSON schema file
      await this.mcpEndpointRegistry.loadFromMCPJson(this.config.mcpJSON)
      if (this.config.capabilities.resources) {
        const resourcesMeta = getMCPResourcesMeta()
        this.mcpEndpointRegistry.setResourcesMeta(resourcesMeta)
      }

      if (this.config.capabilities.tools) {
        const toolsMeta = getMCPToolsMeta()
        this.mcpEndpointRegistry.setToolsMeta(toolsMeta)
      }

      if (this.config.capabilities.prompts) {
        const promptsMeta = getMCPPromptsMeta()
        this.mcpEndpointRegistry.setPromptsMeta(promptsMeta)
      }
    } catch (error) {
      this.logger.error('Failed to initialize MCP server:', error)
      throw error
    }
  }

  public async stop(): Promise<void> {
    await stopSingletonServices()
    for (const { server, transport } of this.sessions.values()) {
      await transport.close()
      await server.close()
    }
    this.sessions.clear()
    if (this.server) {
      await this.server.close()
    }
  }

  private createConfiguredServer(): Server {
    const server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: this.config.capabilities,
      }
    )

    if (this.config.capabilities.resources) {
      this.setupResources(server)
    }
    if (this.config.capabilities.tools) {
      this.setupTools(server)
    }
    if (this.config.capabilities.prompts) {
      this.setupPrompts(server)
    }

    return server
  }

  public async connect(transport: Transport): Promise<void> {
    if (this.connected) {
      throw new Error('MCP server is already connected')
    }
    this.server = this.createConfiguredServer()
    await this.server.connect(transport)
    this.connected = true
  }

  public async connectStdio(): Promise<void> {
    const transport = new StdioServerTransport()
    await this.connect(transport)
  }

  public createHTTPRequestHandler(options?: { path?: string }): {
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  } {
    const mcpPath = options?.path ?? '/mcp'

    const processLogger = this.logger

    const handler = async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
        if (url.pathname !== mcpPath) {
          res.writeHead(404).end()
          return
        }

        if (req.method === 'POST') {
          await this.handleHTTPPost(req, res)
        } else if (req.method === 'GET') {
          const sessionId = req.headers['mcp-session-id'] as string | undefined
          if (sessionId && this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId)!
            await session.transport.handleRequest(req, res)
          } else {
            res.writeHead(400).end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Invalid or missing session ID' },
                id: null,
              })
            )
          }
        } else if (req.method === 'DELETE') {
          const sessionId = req.headers['mcp-session-id'] as string | undefined
          if (sessionId && this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId)!
            await session.transport.close()
            await session.server.close()
            this.sessions.delete(sessionId)
            res.writeHead(200).end()
          } else {
            res.writeHead(405).end()
          }
        } else {
          res.writeHead(405).end()
        }
      } catch (err) {
        processLogger?.error('mcp handler error', err)
        if (!res.headersSent) {
          res.writeHead(500).end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Internal server error' },
              id: null,
            })
          )
        }
      }
    }

    return { handler }
  }

  private async handleHTTPPost(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!
      await session.transport.handleRequest(req, res)
      return
    }

    const body = await new Promise<string>((resolve) => {
      let data = ''
      req.on('data', (chunk: Buffer) => (data += chunk.toString()))
      req.on('end', () => resolve(data))
    })

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(body)
    } catch {
      res.writeHead(400).end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
          id: null,
        })
      )
      return
    }

    if (!isInitializeRequest(parsedBody)) {
      res.writeHead(400).end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        })
      )
      return
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (newSessionId) => {
        this.sessions.set(newSessionId, { server, transport })
      },
    })

    transport.onclose = () => {
      const sid = transport.sessionId
      if (sid) {
        this.sessions.delete(sid)
      }
    }

    const server = this.createConfiguredServer()
    await server.connect(transport)
    await transport.handleRequest(req, res, parsedBody)
  }

  public async connectHTTP(options?: MCPHttpOptions): Promise<{
    httpServer: HttpServer
    close: () => Promise<void>
  }> {
    const { handler } = this.createHTTPRequestHandler({
      path: options?.path,
    })
    const port = options?.port ?? 3000
    const host = options?.host ?? '127.0.0.1'

    const httpServer = createServer(handler)

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        httpServer.removeListener('error', onError)
        reject(err)
      }
      httpServer.on('error', onError)
      httpServer.listen(port, host, () => {
        httpServer.removeListener('error', onError)
        this.logger.info(
          `MCP HTTP server listening on http://${host}:${port}${options?.path ?? '/mcp'}`
        )
        resolve()
      })
    })

    return {
      httpServer,
      close: async () => {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((err) => (err ? reject(err) : resolve()))
        })
        await this.stop()
      },
    }
  }

  public createMCPLogger(): Logger {
    const server = this.server
    const logger: Logger = {
      info: function (
        messageOrObj: string | Record<string, any>,
        ...meta: any[]
      ): void {
        server.sendLoggingMessage({
          level: 'info',
          data:
            typeof messageOrObj === 'string'
              ? meta.length > 0
                ? { message: messageOrObj, meta }
                : messageOrObj
              : messageOrObj,
        })
      },
      warn: function (
        messageOrObj: string | Record<string, any>,
        ...meta: any[]
      ): void {
        server.sendLoggingMessage({
          level: 'warning',
          data:
            typeof messageOrObj === 'string'
              ? meta.length > 0
                ? { message: messageOrObj, meta }
                : messageOrObj
              : messageOrObj,
        })
      },
      error: function (
        messageOrObj: string | Record<string, any> | Error,
        ...meta: any[]
      ): void {
        server.sendLoggingMessage({
          level: 'error',
          data:
            typeof messageOrObj === 'string'
              ? meta.length > 0
                ? { message: messageOrObj, meta }
                : messageOrObj
              : messageOrObj,
        })
      },
      debug: function (message: string, ...meta: any[]): void {
        server.sendLoggingMessage({
          level: 'debug',
          data: meta.length > 0 ? { message, meta } : message,
        })
      },
      setLevel: function (_level: any): void {
        throw new Error('Function not implemented.')
      },
    }
    return logger
  }

  private createMCPService(server: Server): PikkuMCP {
    const mcpEndpointRegistry = this.mcpEndpointRegistry

    return {
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
    }
  }

  private setupTools(server: Server): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
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

    const mcp = this.createMCPService(server)

    // Handler for calling tools
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      try {
        const result = await runMCPTool(
          {
            jsonrpc: '2.0' as const,
            id: Date.now().toString(),
            params: args || {},
          },
          { mcp },
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

  private setupResources(server: Server): void {
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
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
    })

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
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

    const mcp = this.createMCPService(server)

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params
      try {
        const { result: contents } = await runMCPResource(
          {
            jsonrpc: '2.0' as const,
            id: Date.now().toString(),
            params: {},
          },
          { mcp },
          uri
        )
        return {
          contents,
        }
      } catch (error: unknown) {
        if (error instanceof MCPError) {
          const { code, message, data } = error.error
          server.sendLoggingMessage({
            level: 'error',
            data: `Error reading resource ${uri}: code ${code}: ${message}`,
          })
          throw new McpError(code, message, data)
        }

        server.sendLoggingMessage({
          level: 'error',
          data: `Error reading resource ${uri}: ${error instanceof Error ? error.message : String(error)}`,
        })
        throw error
      }
    })
  }

  private setupPrompts(server: Server): void {
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      const promptsMeta = Object.values(getMCPPromptsMeta())
      return {
        prompts: promptsMeta.map((prompt) => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments || [],
        })),
      } as ListPromptsResult
    })

    const mcp = this.createMCPService(server)

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
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
        { mcp },
        name
      )

      return {
        messages: result.result,
      }
    })
  }
}
