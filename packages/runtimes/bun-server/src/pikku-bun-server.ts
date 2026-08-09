import type { Server as BunServer, ServerWebSocket } from 'bun'

import type { CoreConfig } from '@pikku/core'
import { stopSingletonServices } from '@pikku/core'
import type { JWTService, Logger } from '@pikku/core/services'
import { pikkuState } from '@pikku/core/ecosystem'
import type { LocalContentConfig } from '@pikku/core/services/local-content'
import {
  createLocalContentRequestHandler,
  type LocalContentRequestHandler,
} from '@pikku/core/services/local-content-request-handler'
import {
  fetchData,
  PikkuFetchHTTPRequest,
  PikkuFetchHTTPResponse,
  logRoutes as logRegisterRoutes,
  type RunHTTPWiringOptions,
} from '@pikku/core/http'
import { logChannels } from '@pikku/core/channel'
import type { PikkuLocalChannelHandler } from '@pikku/core/channel/local'
import { runLocalChannel } from '@pikku/core/channel/local'
import { compileAllSchemas } from '@pikku/core/schema'

import { resolve } from 'node:path'

import { BunEventHubService } from './bun-event-hub-service.js'

export type StaticMount = {
  urlPrefix: string
  directory: string
  spaFallback?: boolean
}

export type BunServerConfig = CoreConfig & {
  port: number
  hostname?: string
  staticMounts?: StaticMount[]
  healthCheckPath?: string
  /**
   * Serve the `LocalContent` upload and asset prefixes. Pass the same config the
   * `LocalContent` service was built from — it is that service which hands the
   * browser these URLs, and a prefix that disagrees produces a 404 naming
   * nothing. Mirrors `PikkuNodeHTTPServerConfig.content`.
   */
  content?: LocalContentConfig
}

export type PikkuBunServerOptions = RunHTTPWiringOptions & {
  /**
   * Event hub backing channel pub/sub. Inject the SAME instance passed to
   * `createSingletonServices` so functions and the WebSocket transport share
   * one hub — otherwise a function's `eventHub.publish(...)` goes to a
   * different hub than the one holding the live sockets and never reaches
   * connected clients. Defaults to a fresh `BunEventHubService`.
   */
  eventHub?: BunEventHubService
  /**
   * Parsed content of `.pikku/mcp/mcp.gen.json`. When provided and non-empty,
   * `@pikku/modelcontextprotocol` is dynamically imported and the MCP server is
   * mounted at `mcpPath` via the SDK's fetch-native (Web Standard) transport.
   * Import the JSON statically so bundlers (esbuild) inline it — no file read.
   * Mirrors `PikkuNodeHTTPServerOptions.mcpJson`.
   */
  mcpJson?: { tools?: unknown[]; resources?: unknown[]; prompts?: unknown[] }
  /**
   * Path the MCP server is mounted at when `mcpJson` is provided. Default `/mcp`.
   */
  mcpPath?: string
  /**
   * The JWT service `LocalContent` signs asset URLs with. Required to serve
   * `config.content`'s asset prefix: without it every signed read is refused,
   * since an unverifiable signature is no signature. Falls back to
   * `singletonServices.jwt`. Mirrors
   * `PikkuNodeHTTPServerOptions.contentSigningJWT`.
   */
  contentSigningJWT?: JWTService
}

type WsData = { channelHandler: PikkuLocalChannelHandler }

const isSerializable = (data: unknown): boolean =>
  !(
    typeof data === 'string' ||
    data instanceof ArrayBuffer ||
    data instanceof Uint8Array ||
    data instanceof Int8Array ||
    data instanceof Uint16Array ||
    data instanceof Int16Array ||
    data instanceof Uint32Array ||
    data instanceof Int32Array ||
    data instanceof Float32Array ||
    data instanceof Float64Array
  )

/**
 * Bun-native Pikku server built on Bun.serve.
 *
 * Handles HTTP via the fetch handler and WebSocket via Bun.serve's native
 * websocket handler (which is backed by uWebSockets internally).
 */
export class PikkuBunServer {
  private server: BunServer<WsData> | null = null
  private readonly eventHub: BunEventHubService
  private readonly options: RunHTTPWiringOptions
  private readonly mcpJson?: PikkuBunServerOptions['mcpJson']
  private readonly mcpPath: string
  private mcpHandler?: (request: Request) => Promise<Response>
  private readonly localContent?: LocalContentRequestHandler

  constructor(
    private readonly config: BunServerConfig,
    private readonly logger: Logger,
    options: PikkuBunServerOptions = {}
  ) {
    const { eventHub, mcpJson, mcpPath, contentSigningJWT, ...httpOptions } =
      options
    this.eventHub = eventHub ?? new BunEventHubService()
    this.mcpJson = mcpJson
    this.mcpPath = mcpPath ?? '/mcp'
    this.options = httpOptions
    this.localContent = config.content
      ? createLocalContentRequestHandler({
          content: config.content,
          logger,
          // Resolved per request: `singletonServices` is populated after the
          // server is constructed, so reading it here would always miss.
          getJWT: () =>
            contentSigningJWT ??
            pikkuState(null, 'package', 'singletonServices')?.jwt,
        })
      : undefined
  }

  public async init(): Promise<void> {
    compileAllSchemas(this.logger)
    logRegisterRoutes(this.logger)
    logChannels(this.logger)
    await this.initMCP()
  }

  private async initMCP(): Promise<void> {
    const mcpJson = this.mcpJson
    if (!mcpJson) return
    const { tools = [], resources = [], prompts = [] } = mcpJson
    if (tools.length + resources.length + prompts.length === 0) return
    try {
      const { PikkuMCPServer } = await import('@pikku/modelcontextprotocol')
      const mcpServer = new PikkuMCPServer(
        {
          name: 'pikku',
          version: '1.0.0',
          mcpJSON: mcpJson,
          capabilities: {
            ...(tools.length > 0 && { tools: {} }),
            ...(resources.length > 0 && { resources: {} }),
            ...(prompts.length > 0 && { prompts: {} }),
          },
        },
        this.logger
      )
      await mcpServer.init()
      const { handler } = mcpServer.createFetchHandler({ path: this.mcpPath })
      this.mcpHandler = handler
      this.logger.info(`pikku-bun-server: MCP mounted at ${this.mcpPath}`)
    } catch (err) {
      this.logger.warn(
        `pikku-bun-server: MCP could not be mounted — ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  public async start(): Promise<void> {
    const { config, logger, options, eventHub, mcpHandler, mcpPath } = this

    this.server = Bun.serve<WsData>({
      port: config.port,
      hostname: config.hostname,

      fetch: async (req, server) => {
        if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
          const pikkuReq = new PikkuFetchHTTPRequest(req)
          const pikkuRes = new PikkuFetchHTTPResponse()
          const channelHandler = await runLocalChannel({
            channelId: crypto.randomUUID(),
            request: pikkuReq,
            response: pikkuRes,
            route: new URL(req.url).pathname,
          })
          if (!channelHandler) {
            return new Response('Forbidden', { status: 403 })
          }
          const upgraded = server.upgrade(req, { data: { channelHandler } })
          if (upgraded) return undefined as unknown as Response
          return new Response('WebSocket upgrade failed', { status: 500 })
        }

        if (
          config.healthCheckPath &&
          new URL(req.url).pathname === config.healthCheckPath
        ) {
          return new Response('{"ok":true}', {
            headers: { 'content-type': 'application/json' },
          })
        }

        if (mcpHandler) {
          const pathname = new URL(req.url).pathname
          if (pathname === mcpPath || pathname.startsWith(`${mcpPath}/`)) {
            return await mcpHandler(req)
          }
        }

        // Ahead of static mounts and routing: these prefixes belong to the
        // content service, and `fetchData` would answer them with a 404 since
        // no wiring claims them.
        const contentResponse = await this.localContent?.(req)
        if (contentResponse) {
          return contentResponse
        }

        const staticResponse = await this.serveStaticMounts(req)
        if (staticResponse) {
          return staticResponse
        }

        const pikkuReq = new PikkuFetchHTTPRequest(req)
        const pikkuRes = new PikkuFetchHTTPResponse()
        await fetchData(pikkuReq, pikkuRes, {
          respondWith404: true,
          ...options,
        })
        return pikkuRes.toResponse()
      },

      websocket: {
        open: (ws: ServerWebSocket<WsData>) => {
          const { channelHandler } = ws.data
          channelHandler.registerOnSend((data) => {
            ws.send(isSerializable(data) ? JSON.stringify(data) : (data as any))
          })
          channelHandler.registerOnSendBinary((data) => {
            ws.send(data, true)
          })
          channelHandler.registerOnClose(() => {
            ws.close()
          })
          eventHub.onChannelOpened(channelHandler.channelId, ws)
          channelHandler.open()
        },

        message: async (ws: ServerWebSocket<WsData>, message) => {
          const { channelHandler } = ws.data
          if (typeof message === 'string') {
            const result = await channelHandler.message(message)
            if (result) ws.send(JSON.stringify(result))
          } else {
            const bytes =
              message instanceof ArrayBuffer
                ? new Uint8Array(message)
                : new Uint8Array(
                    message.buffer,
                    message.byteOffset,
                    message.byteLength
                  )
            const result = await channelHandler.binaryMessage(bytes)
            if (result) channelHandler.sendBinary(result)
          }
        },

        close: (ws: ServerWebSocket<WsData>) => {
          const { channelHandler } = ws.data
          eventHub.onChannelClosed(channelHandler.channelId)
          channelHandler.close()
        },
      },
    })

    eventHub.setServer(this.server as BunServer<unknown>)
    logger.info(
      `pikku-bun-server: listening on http://${config.hostname ?? 'localhost'}:${config.port}`
    )
  }

  public get port(): number {
    return this.server?.port ?? this.config.port
  }

  private async serveStaticMounts(req: Request): Promise<Response | null> {
    const mounts = this.config.staticMounts
    if (!mounts?.length || (req.method !== 'GET' && req.method !== 'HEAD')) {
      return null
    }
    const pathname = decodeURIComponent(new URL(req.url).pathname)

    for (const mount of mounts) {
      if (
        pathname !== mount.urlPrefix &&
        !pathname.startsWith(`${mount.urlPrefix}/`)
      ) {
        continue
      }
      const key = pathname.slice(mount.urlPrefix.length).replace(/^\/+/, '')
      const file = await this.resolveStaticFile(mount, key)
      if (file) {
        return new Response(req.method === 'HEAD' ? null : file)
      }
      if (mount.spaFallback) {
        const index = await this.resolveStaticFile(mount, 'index.html')
        if (index) {
          return new Response(req.method === 'HEAD' ? null : index)
        }
      }
      return new Response('Not Found', { status: 404 })
    }

    return null
  }

  private async resolveStaticFile(
    mount: StaticMount,
    key: string
  ): Promise<ReturnType<typeof Bun.file> | null> {
    const directory = resolve(mount.directory)
    const targetPath =
      key === '' ? resolve(directory, 'index.html') : resolve(directory, key)
    if (targetPath !== directory && !targetPath.startsWith(`${directory}/`)) {
      return null
    }
    let file = Bun.file(targetPath)
    if (!(await file.exists())) {
      const indexPath = resolve(targetPath, 'index.html')
      if (!indexPath.startsWith(`${directory}/`)) {
        return null
      }
      file = Bun.file(indexPath)
      if (!(await file.exists())) {
        return null
      }
    }
    return file
  }

  public async stop(): Promise<void> {
    await this.server?.stop()
    this.server = null
  }

  public enableExitOnSignals(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`pikku-bun-server: ${signal} received, stopping`)
      try {
        await stopSingletonServices()
        await this.stop()
      } finally {
        process.exit(0)
      }
    }
    process.once('SIGINT', () => shutdown('SIGINT'))
    process.once('SIGTERM', () => shutdown('SIGTERM'))
  }
}
