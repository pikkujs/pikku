import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { normalize, resolve } from 'node:path'

import type { CoreConfig } from '@pikku/core'
import { stopSingletonServices } from '@pikku/core'
import { pikkuState } from '@pikku/core/internal'
import type { LocalContentConfig } from '@pikku/core/services/local-content'
import type { JWTService, Logger } from '@pikku/core/services'
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
  content?: LocalContentConfig
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

      if (await this.handleContentRequest(req, res)) {
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

  private async handleContentRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<boolean> {
    const content = this.config.content
    const requestUrl = this.getRequestUrl(req)

    if (!content || !requestUrl) {
      return false
    }

    const pathname = decodeURIComponent(requestUrl.pathname)

    if (
      req.method === 'PUT' &&
      this.matchesPrefix(pathname, content.uploadUrlPrefix)
    ) {
      await this.handleContentUpload(req, res, content, pathname)
      return true
    }

    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      this.matchesPrefix(pathname, content.assetUrlPrefix)
    ) {
      await this.handleContentAsset(req, res, content, requestUrl)
      return true
    }

    return false
  }

  private getRequestUrl(req: IncomingMessage): URL | null {
    if (!req.url) {
      return null
    }

    try {
      return new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    } catch {
      return null
    }
  }

  private matchesPrefix(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  }

  private toTargetPath(basePath: string, key: string): string | null {
    const normalizedBasePath = resolve(basePath)
    const targetPath = resolve(normalizedBasePath, normalize(key))

    if (!targetPath.startsWith(`${normalizedBasePath}/`)) {
      return null
    }

    return targetPath
  }

  private contentKey(pathname: string, prefix: string): string {
    return pathname.slice(prefix.length).replace(/^\/+/, '')
  }

  private async handleContentUpload(
    req: IncomingMessage,
    res: ServerResponse,
    content: LocalContentConfig,
    pathname: string
  ): Promise<void> {
    const key = this.contentKey(pathname, content.uploadUrlPrefix)
    const targetPath = this.toTargetPath(content.localFileUploadPath, key)

    if (!targetPath) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Invalid path')
      return
    }

    try {
      const body = await this.readRequestBody(req, content.sizeLimit ?? '1mb')
      const directory = targetPath.slice(0, targetPath.lastIndexOf('/'))
      await mkdir(directory, { recursive: true })
      await writeFile(targetPath, body)
      res.writeHead(200)
      res.end()
    } catch (err) {
      if (err instanceof Error && err.message === 'content_too_large') {
        res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Content too large')
        return
      }
      throw err
    }
  }

  private async handleContentAsset(
    req: IncomingMessage,
    res: ServerResponse,
    content: LocalContentConfig,
    requestUrl: URL
  ): Promise<void> {
    const pathname = decodeURIComponent(requestUrl.pathname)
    const key = this.contentKey(pathname, content.assetUrlPrefix)
    const targetPath = this.toTargetPath(content.localFileUploadPath, key)

    if (!targetPath) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Invalid path')
      return
    }

    const signedAssetAccess = await this.validateSignedAssetRequest(requestUrl)
    if (!signedAssetAccess.ok) {
      res.writeHead(signedAssetAccess.status, {
        'content-type': 'text/plain; charset=utf-8',
      })
      res.end(signedAssetAccess.body)
      return
    }

    try {
      const file = await stat(targetPath)
      if (!file.isFile()) {
        res.writeHead(404)
        res.end()
        return
      }

      res.writeHead(200, {
        'content-length': String(file.size),
        'content-type': 'application/octet-stream',
      })

      if (req.method === 'HEAD') {
        res.end()
        return
      }

      await new Promise<void>((resolvePromise, reject) => {
        const stream = createReadStream(targetPath)
        stream.on('error', reject)
        stream.on('end', () => resolvePromise())
        stream.pipe(res)
      })
    } catch {
      res.writeHead(404)
      res.end()
    }
  }

  private async validateSignedAssetRequest(
    requestUrl: URL
  ): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
    const signedAtValue = requestUrl.searchParams.get('signedAt')
    const expiresAtValue = requestUrl.searchParams.get('expiresAt')
    const notBeforeValue = requestUrl.searchParams.get('notBefore')
    const signature = requestUrl.searchParams.get('signature')

    if (!signedAtValue || !expiresAtValue) {
      return {
        ok: false,
        status: 403,
        body: 'Signed URL required',
      }
    }

    const signedAt = Number(signedAtValue)
    const expiresAt = Number(expiresAtValue)
    const notBefore =
      notBeforeValue == null ? undefined : Number(notBeforeValue)

    if (
      !Number.isFinite(signedAt) ||
      !Number.isFinite(expiresAt) ||
      (notBefore != null && !Number.isFinite(notBefore))
    ) {
      return {
        ok: false,
        status: 403,
        body: 'Invalid signed URL',
      }
    }

    const now = Date.now()
    if (now > expiresAt || (notBefore != null && now < notBefore)) {
      return {
        ok: false,
        status: 403,
        body: 'Signed URL expired',
      }
    }

    const jwt = this.getJWTService()
    if (!jwt) {
      return { ok: true }
    }

    if (!signature) {
      return {
        ok: false,
        status: 403,
        body: 'Signed URL signature required',
      }
    }

    try {
      const payload = await jwt.decode<{
        signedAt?: number
        expiresAt?: number
        notBefore?: number
      }>(signature)

      if (
        payload.signedAt !== signedAt ||
        payload.expiresAt !== expiresAt ||
        payload.notBefore !== notBefore
      ) {
        return {
          ok: false,
          status: 403,
          body: 'Invalid signed URL',
        }
      }
    } catch {
      return {
        ok: false,
        status: 403,
        body: 'Invalid signed URL',
      }
    }

    return { ok: true }
  }

  private getJWTService(): JWTService | undefined {
    return pikkuState(null, 'package', 'singletonServices')?.jwt
  }

  private async readRequestBody(
    req: IncomingMessage,
    sizeLimit: string
  ): Promise<Buffer> {
    const maxBytes = this.parseSizeLimit(sizeLimit)
    const chunks: Buffer[] = []
    let bytesRead = 0

    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytesRead += buffer.length
      if (bytesRead > maxBytes) {
        throw new Error('content_too_large')
      }
      chunks.push(buffer)
    }

    return Buffer.concat(chunks)
  }

  private parseSizeLimit(sizeLimit: string): number {
    const match = /^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i.exec(sizeLimit.trim())
    if (!match) {
      throw new Error(`Invalid size limit: ${sizeLimit}`)
    }

    const value = Number(match[1])
    const unit = (match[2] ?? 'b').toLowerCase()
    const multiplier =
      unit === 'gb'
        ? 1024 * 1024 * 1024
        : unit === 'mb'
          ? 1024 * 1024
          : unit === 'kb'
            ? 1024
            : 1

    return Math.floor(value * multiplier)
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
