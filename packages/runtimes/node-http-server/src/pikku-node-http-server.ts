import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'

import type { CoreConfig } from '@pikku/core'
import { stopSingletonServices } from '@pikku/core'
import type { Logger } from '@pikku/core/services'
import {
  fetchData,
  PikkuFetchHTTPResponse,
  logRoutes as logRegisterRoutes,
  type RunHTTPWiringOptions,
} from '@pikku/core/http'
import { compileAllSchemas } from '@pikku/core/schema'

import { incomingMessageToRequest } from './request-converter.js'
import { writeResponse } from './response-writer.js'

export type NodeHTTPServerConfig = CoreConfig & {
  port: number
  hostname: string
  healthCheckPath?: string
  /**
   * Time the server will wait for the request headers to be received.
   * Mitigates slowloris on the header phase. Default 30_000ms.
   */
  headersTimeout?: number
  /**
   * Time the server will wait for the entire request to be received.
   * Mitigates slow-body attacks. Default 30_000ms.
   */
  requestTimeout?: number
  /**
   * How long an idle keep-alive connection is held. Should be **longer**
   * than the upstream LB / proxy idle timeout to avoid the reuse race
   * (server closes a socket the upstream just decided to reuse →
   * ECONNRESET storms on retry). 65s suits CF / AWS ALB / GCP LB.
   * Default 65_000ms.
   */
  keepAliveTimeout?: number
  /**
   * Cap how many requests a single socket may handle before the server
   * forces it to close. Defends against pathological keep-alive clients.
   * Default 1000.
   */
  maxRequestsPerSocket?: number
  /**
   * Grace period during `stop()` before force-closing in-flight
   * connections. Idle connections close immediately. Default 10_000ms.
   */
  shutdownGracePeriodMs?: number
}

export type PikkuNodeHTTPServerOptions = {
  /**
   * Hook to attach extra listeners to the underlying http.Server before it
   * starts (e.g. WebSocket upgrades). Called once during `init()`.
   */
  configureServer?: (server: Server) => void | Promise<void>
} & RunHTTPWiringOptions

const HARDENING_DEFAULTS = {
  headersTimeout: 30_000,
  requestTimeout: 30_000,
  keepAliveTimeout: 65_000,
  maxRequestsPerSocket: 1000,
  shutdownGracePeriodMs: 10_000,
} as const

/**
 * Plain `node:http`-based Pikku server. Mirrors the `PikkuUWSServer` API so
 * `pikku dev`, container deployments, and any other Node-runtime target can
 * share the same HTTP entry path.
 *
 * Not optimised for raw throughput — when traffic terminates at this server
 * directly (public ingress, hot path), prefer `@pikku/uws`. When something
 * else (Cloudflare Workers, a load balancer, `pikku dev` proxy) sits in
 * front, this is the right default.
 */
export class PikkuNodeHTTPServer {
  public server: Server
  private listening = false
  private shutdownGracePeriodMs: number

  constructor(
    private readonly config: NodeHTTPServerConfig,
    private readonly logger: Logger,
    private readonly options: PikkuNodeHTTPServerOptions = {}
  ) {
    this.server = createServer(this.handleRequest)
    this.server.headersTimeout =
      config.headersTimeout ?? HARDENING_DEFAULTS.headersTimeout
    this.server.requestTimeout =
      config.requestTimeout ?? HARDENING_DEFAULTS.requestTimeout
    this.server.keepAliveTimeout =
      config.keepAliveTimeout ?? HARDENING_DEFAULTS.keepAliveTimeout
    this.server.maxRequestsPerSocket =
      config.maxRequestsPerSocket ?? HARDENING_DEFAULTS.maxRequestsPerSocket
    this.shutdownGracePeriodMs =
      config.shutdownGracePeriodMs ?? HARDENING_DEFAULTS.shutdownGracePeriodMs
  }

  public async init(): Promise<void> {
    compileAllSchemas(this.logger)
    if (this.options.configureServer) {
      await this.options.configureServer(this.server)
    }
    logRegisterRoutes(this.logger)
  }

  private handleRequest = async (
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> => {
    try {
      const healthPath = this.config.healthCheckPath
      if (healthPath && req.url === healthPath) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
        return
      }

      const request = incomingMessageToRequest(req)
      const pikkuResponse = new PikkuFetchHTTPResponse()
      const { configureServer: _, ...runOptions } = this.options
      await fetchData(request, pikkuResponse, {
        respondWith404: true,
        ...runOptions,
      })
      const response = pikkuResponse.toResponse()
      await writeResponse(res, response)
    } catch (err) {
      this.logger.error(`node-http-server: handler error: ${err}`)
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' })
      }
      try {
        res.end('{"error":"internal_error"}')
      } catch {
        // already ended
      }
    }
  }

  public async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.server.listen(this.config.port, this.config.hostname, () => {
        this.listening = true
        this.logger.info(
          `pikku-node-http-server: listening on http://${this.config.hostname}:${this.config.port}`
        )
        resolve()
      })
    })
  }

  public async stop(): Promise<void> {
    if (!this.listening) return

    // Drain pattern:
    //  1. server.close() — stops accepting new connections, but waits
    //     for ALL existing ones (including idle keep-alive) to close.
    //  2. closeIdleConnections() — drops idle keep-alive sockets now,
    //     so they don't hold the close() promise open indefinitely.
    //  3. After the grace window, closeAllConnections() force-closes
    //     anything still in flight so the process can actually exit.
    const closePromise = new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()))
    })

    this.server.closeIdleConnections()

    const forceTimer = setTimeout(() => {
      this.logger.info(
        `pikku-node-http-server: shutdown grace (${this.shutdownGracePeriodMs}ms) elapsed, force-closing in-flight connections`
      )
      this.server.closeAllConnections()
    }, this.shutdownGracePeriodMs)
    forceTimer.unref()

    try {
      await closePromise
    } finally {
      clearTimeout(forceTimer)
      this.listening = false
    }
  }

  public enableExitOnSignals(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`pikku-node-http-server: ${signal} received, stopping`)
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
