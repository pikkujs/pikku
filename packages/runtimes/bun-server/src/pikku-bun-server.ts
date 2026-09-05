import type { Server as BunServer, ServerWebSocket } from 'bun'

import type { CoreConfig } from '@pikku/core/types'
import { stopSingletonServices } from '@pikku/core/utils'
import type { JWTService, Logger } from '@pikku/core/services'
import { pikkuState } from '@pikku/core/state'
import type { LocalContentConfig } from '@pikku/core/services/local-content'
import {
  createLocalContentRequestHandler,
  type LocalContentRequestHandler,
} from '@pikku/core/services/local-content-request-handler'
import {
  fetchData,
  PikkuFetchHTTPRequest,
  PikkuFetchHTTPResponse,
} from '@pikku/core/http'
import {
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
  /**
   * Serve from an explicit key → path map instead of from `directory`, which is
   * then unused. Keys are mount-relative request paths (`index.html`,
   * `assets/app-a1b2c3.js`).
   *
   * This exists for assets that are not laid out as a directory at all: a
   * `bun build --compile` binary embeds each file and hands back an opaque
   * `/$bunfs/…` path, so the only way to find one is to have recorded it at
   * build time.
   */
  assets?: Record<string, string>
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
/**
 * Work the process owes its app on the way down, run around the service
 * teardown `enableExitOnSignals` already does. A failing hook is logged and
 * shutdown continues: a process that has been told to stop has to stop.
 */
export type ShutdownHooks = {
  beforeStop?: () => void | Promise<void>
  afterStop?: () => void | Promise<void>
}

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

        const staticResponse = await this.serveStaticFiles(req)
        if (staticResponse) {
          return staticResponse
        }

        const pikkuReq = new PikkuFetchHTTPRequest(req)
        const pikkuRes = new PikkuFetchHTTPResponse()
        await fetchData(pikkuReq, pikkuRes, {
          respondWith404: true,
          ...options,
        })
        const response = pikkuRes.toResponse()
        if (response.status === 404) {
          const fallback = await this.serveSpaFallback(req)
          if (fallback) {
            return fallback
          }
        }
        return response
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
          eventHub.registerSocket(channelHandler.channelId, ws)
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
      `pikku-bun-server: listening on http://${config.hostname ?? 'localhost'}:${this.port}`
    )
  }

  /**
   * The port the server is actually listening on.
   *
   * Not the same as `config.port` whenever that is `0`: the OS picks a free
   * port at bind time, and a parent process that was told `0` has no other way
   * to find out which one. Falls back to the requested port before `start()`.
   */
  public get port(): number {
    return this.server?.port ?? this.config.port
  }

  private matchesPrefix(pathname: string, prefix: string): boolean {
    // A root mount covers the whole tree; the generic test below would match
    // only `/` itself, since nothing starts with `//`.
    if (prefix === '' || prefix === '/') {
      return true
    }
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  }

  /**
   * Resolve the mounts a GET/HEAD request could be served from, or null when
   * static serving does not apply to this request at all.
   */
  private staticMountCandidates(
    req: Request
  ): { pathname: string; mounts: StaticMount[] } | null {
    const mounts = this.config.staticMounts
    if (!mounts?.length || (req.method !== 'GET' && req.method !== 'HEAD')) {
      return null
    }
    const pathname = decodeURIComponent(new URL(req.url).pathname)
    return {
      pathname,
      mounts: mounts.filter((mount) =>
        this.matchesPrefix(pathname, mount.urlPrefix)
      ),
    }
  }

  /**
   * Serve an exact file hit only. A miss falls through to route dispatch, so a
   * mount at `/` cannot swallow the API — the app shell is served afterwards by
   * `serveSpaFallback`, once dispatch has had its chance and produced a 404.
   */
  private async serveStaticFiles(req: Request): Promise<Response | null> {
    const candidates = this.staticMountCandidates(req)
    if (!candidates) {
      return null
    }

    for (const mount of candidates.mounts) {
      const key = candidates.pathname
        .slice(mount.urlPrefix.length)
        .replace(/^\/+/, '')
      const result = await this.resolveStaticFile(mount, key)
      if (result === 'rejected') {
        // A key that escaped the mount directory is refused outright rather
        // than falling through, which would answer a traversal attempt with a
        // 200 and the app shell.
        return new Response('Not Found', { status: 404 })
      }
      if (result) {
        return new Response(req.method === 'HEAD' ? null : result)
      }
    }

    return null
  }

  /**
   * Last resort for a client-side route: dispatch has already 404'd, so an
   * unmatched path under a `spaFallback` mount is the SPA's own routing.
   */
  private async serveSpaFallback(req: Request): Promise<Response | null> {
    const candidates = this.staticMountCandidates(req)
    if (!candidates) {
      return null
    }

    for (const mount of candidates.mounts) {
      if (!mount.spaFallback) {
        continue
      }
      const index = await this.resolveStaticFile(mount, 'index.html')
      if (index && index !== 'rejected') {
        return new Response(req.method === 'HEAD' ? null : index)
      }
    }

    return null
  }

  /**
   * `'rejected'` is kept distinct from `null` because the two must not share a
   * fate: a missing file is a candidate for the SPA fallback, while a key that
   * resolved outside the mount directory must never be. An `assets` mount never
   * produces `'rejected'` at all — a map lookup has no directory to escape.
   */
  private async resolveStaticFile(
    mount: StaticMount,
    key: string
  ): Promise<ReturnType<typeof Bun.file> | 'rejected' | null> {
    if (mount.assets) {
      const assetPath = mount.assets[key === '' ? 'index.html' : key]
      if (!assetPath) {
        return null
      }
      const asset = Bun.file(assetPath)
      return (await asset.exists()) ? asset : null
    }

    const directory = resolve(mount.directory)
    const targetPath =
      key === '' ? resolve(directory, 'index.html') : resolve(directory, key)
    if (targetPath !== directory && !targetPath.startsWith(`${directory}/`)) {
      return 'rejected'
    }
    let file = Bun.file(targetPath)
    if (!(await file.exists())) {
      const indexPath = resolve(targetPath, 'index.html')
      if (!indexPath.startsWith(`${directory}/`)) {
        return 'rejected'
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

  public enableExitOnSignals(hooks?: ShutdownHooks): void {
    /**
     * Every step of the shutdown is isolated from the ones after it. Sharing
     * one catch means a hook that throws takes the service teardown and the
     * socket close down with it, leaving the process to exit with connections
     * still open and services still holding their handles.
     */
    const phase = async (name: string, run: () => void | Promise<void>) => {
      try {
        await run()
      } catch (error) {
        this.logger.error(
          `pikku-bun-server: ${name} failed during shutdown`,
          error
        )
      }
    }
    const shutdown = async (signal: string) => {
      this.logger.info(`pikku-bun-server: ${signal} received, stopping`)
      try {
        await phase('beforeStop', () => hooks?.beforeStop?.())
        await phase('stopping singleton services', () =>
          stopSingletonServices()
        )
        await phase('stopping the server', () => this.stop())
        await phase('afterStop', () => hooks?.afterStop?.())
      } finally {
        process.exit(0)
      }
    }
    process.once('SIGINT', () => shutdown('SIGINT'))
    process.once('SIGTERM', () => shutdown('SIGTERM'))
  }
}
