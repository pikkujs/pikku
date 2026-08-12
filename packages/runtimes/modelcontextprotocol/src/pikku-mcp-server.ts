import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
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
} from '@modelcontextprotocol/sdk/types.js'

import type { CoreConfig } from '@pikku/core'
import { stopSingletonServices } from '@pikku/core'
import type { Logger } from '@pikku/core/services'

import type { PikkuHTTP } from '@pikku/core/http'
import { PikkuFetchHTTPRequest } from '@pikku/core/http'

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

/**
 * A node `IncomingMessage` as the web-standard `Request` the MCP transport and
 * the pikku runner both speak.
 *
 * The body is streamed rather than buffered so a large `tools/call` payload does
 * not have to be held whole before the transport sees any of it. GET and DELETE
 * carry no body, and giving `Request` one for those methods is an error.
 */
const nodeRequestAsWebRequest = (req: IncomingMessage): Request => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry)
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }
  const method = req.method ?? 'POST'
  const host = req.headers.host ?? 'localhost'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(new URL(req.url ?? '/', `http://${host}`), {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // Required by undici whenever a body is present on a streamed request.
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit)
}

/**
 * Write a web-standard `Response` back out over a node `ServerResponse`.
 *
 * The body is piped rather than awaited so an SSE stream reaches the client as
 * it is produced — buffering it would hold the whole MCP response until the
 * stream closed, which for a streaming transport is never.
 */
const writeWebResponse = async (
  res: ServerResponse,
  response: Response
): Promise<void> => {
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (!response.body) {
    res.end()
    return
  }
  await pipeline(Readable.fromWeb(response.body as any), res)
}

export class PikkuMCPServer {
  private server!: Server
  private mcpEndpointRegistry: MCPEndpointRegistry
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
    if (this.server) {
      await this.server.close()
    }
  }

  /**
   * @param http the request this server instance is serving, when there is one.
   * Every HTTP call gets a fresh server built around its own request, and that
   * request is what the runner hands the app's auth middleware — so an MCP tool
   * can see who is calling it. Node reaches this through the same fetch handler,
   * so both runtimes authenticate identically. Stdio has no request and stays
   * anonymous.
   */
  private createConfiguredServer(http?: PikkuHTTP): Server {
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
      this.setupResources(server, http)
    }
    if (this.config.capabilities.tools) {
      this.setupTools(server, http)
    }
    if (this.config.capabilities.prompts) {
      this.setupPrompts(server, http)
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

  /**
   * The node HTTP entry point, as an adapter over {@link createFetchHandler}.
   *
   * The MCP SDK's own node transport is a wrapper around its web-standard one,
   * so a second dispatch path here would only be a second place for the two
   * runtimes to disagree — which is how node MCP calls ended up running without
   * the caller's request while fetch ones carried it. Node is stateless for the
   * same reason fetch is: each request brings its own credentials rather than
   * inheriting them from whoever opened a session id.
   */
  public createHTTPRequestHandler(options?: { path?: string }): {
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  } {
    const { handler: fetchHandler } = this.createFetchHandler(options)
    const processLogger = this.logger

    const handler = async (req: IncomingMessage, res: ServerResponse) => {
      try {
        await writeWebResponse(
          res,
          await fetchHandler(nodeRequestAsWebRequest(req))
        )
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

  /**
   * The one MCP dispatch path, taking a `Request` and returning a `Response`
   * via the SDK's WebStandard transport. It serves the web-standard runtimes
   * (bun, workers, deno) directly and node through `createHTTPRequestHandler`.
   * Stateless: a fresh transport + configured server per request (the
   * recommended web-standard pattern; no session map to leak across requests).
   */
  public createFetchHandler(options?: { path?: string }): {
    handler: (request: Request) => Promise<Response>
  } {
    const mcpPath = options?.path ?? '/mcp'
    const handler = async (request: Request): Promise<Response> => {
      const url = new URL(request.url)
      if (url.pathname !== mcpPath) {
        return new Response(null, { status: 404 })
      }
      const transport = new WebStandardStreamableHTTPServerTransport()
      // The MCP body is read by the transport, so the request is cloned before
      // being wrapped: both would otherwise compete for the same single-use
      // body stream. Only headers and cookies are wanted here — a tool's input
      // comes from the JSON-RPC params, not the HTTP body.
      const server = this.createConfiguredServer({
        request: new PikkuFetchHTTPRequest(request.clone()),
      })
      await server.connect(transport)
      return transport.handleRequest(request)
    }
    return { handler }
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

  private setupTools(server: Server, http?: PikkuHTTP): void {
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
          { mcp, http },
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
        throw new McpError(-32603, 'Internal error')
      }
    })
  }

  private setupResources(server: Server, http?: PikkuHTTP): void {
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
          { mcp, http },
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

  private setupPrompts(server: Server, http?: PikkuHTTP): void {
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
        { mcp, http },
        name
      )

      return {
        messages: result.result,
      }
    })
  }
}
