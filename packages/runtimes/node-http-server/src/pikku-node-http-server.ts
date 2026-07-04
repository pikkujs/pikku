import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { normalize, resolve } from 'node:path'
import { randomUUID, timingSafeEqual } from 'node:crypto'

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
import {
  runQueueJob,
  type QueueJob,
  type QueueJobStatus,
} from '@pikku/core/queue'
import { runScheduledTask } from '@pikku/core/scheduler'

import { incomingMessageToRequest } from './request-converter.js'
import { writeResponse } from './response-writer.js'

export type StaticMount = {
  /** URL prefix the directory is mounted at, e.g. `/console`. */
  urlPrefix: string
  /** Absolute directory the files are served from. */
  directory: string
  /**
   * Serve the mount's `index.html` for unknown GET paths under the prefix so
   * client-side (SPA) routes deep-link correctly.
   */
  spaFallback?: boolean
}

export type NodeHTTPServerConfig = CoreConfig & {
  port: number
  hostname: string
  content?: LocalContentConfig
  staticMounts?: StaticMount[]
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
  /**
   * Parsed content of `.pikku/mcp/mcp.gen.json`. When provided and non-empty,
   * `@pikku/modelcontextprotocol` is dynamically imported and the MCP server is
   * mounted at `mcpPath`.
   * Import the JSON statically so bundlers (esbuild) inline it: no runtime file read needed.
   */
  mcpJson?: { tools?: unknown[]; resources?: unknown[]; prompts?: unknown[] }
  /**
   * Path the MCP server is mounted at when `mcpJson` is provided. Default `/mcp`.
   */
  mcpPath?: string
  /**
   * Mount the in-stack dispatch routes `POST /__pikku/queue-job` and
   * `POST /__pikku/scheduler-job` so a trusted dispatcher can deliver queue
   * jobs and scheduled tasks to a server (container) target that has no
   * platform queue/cron binding of its own. Mirrors the CF handler's
   * `httpQueueJobs`. Off by default.
   *
   * Unlike a CF WfP namespace script, a container usually HAS a public
   * hostname — so set `dispatchSecret` to require the shared secret on these
   * routes. Without it they are unauthenticated and anyone who can reach the
   * server could trigger queue/scheduled work.
   */
  dispatchJobs?: boolean
  /**
   * Shared secret required in the `x-pikku-dispatch` header on the dispatch
   * routes (when `dispatchJobs` is on). The dispatcher attaches it; public
   * callers don't have it. When unset, the routes accept any caller and a
   * warning is logged at startup.
   */
  dispatchSecret?: string
} & RunHTTPWiringOptions

const STATIC_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

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
  private mcpPath: string
  private mcpHandler?: (
    req: IncomingMessage,
    res: ServerResponse
  ) => Promise<void>

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
    this.mcpPath = options.mcpPath ?? '/mcp'
  }

  public async init(): Promise<void> {
    compileAllSchemas(this.logger)
    if (this.options.configureServer) {
      await this.options.configureServer(this.server)
    }
    logRegisterRoutes(this.logger)
    if (this.options.dispatchJobs && !this.options.dispatchSecret) {
      this.logger.warn(
        'pikku-node-http-server: dispatch routes (/__pikku/queue-job, /__pikku/scheduler-job) are mounted WITHOUT a dispatchSecret — any caller that can reach this server can trigger queue/scheduled work.'
      )
    }
    await this.initMCP()
  }

  private async initMCP(): Promise<void> {
    const mcpJson = this.options.mcpJson
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
      const { handler } = mcpServer.createHTTPRequestHandler({
        path: this.mcpPath,
      })
      this.mcpHandler = handler
      this.logger.info(`pikku-node-http-server: MCP mounted at ${this.mcpPath}`)
    } catch (err) {
      this.logger.warn(
        `pikku-node-http-server: MCP could not be mounted — ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  private matchesMcpPath(url: string): boolean {
    if (!url.startsWith(this.mcpPath)) {
      return false
    }
    const boundary = url.charAt(this.mcpPath.length)
    return (
      boundary === '' ||
      boundary === '/' ||
      boundary === '?' ||
      boundary === '#'
    )
  }

  /**
   * Handle the in-stack dispatch routes. Mirrors the CF handler's
   * `/__pikku/queue-job` + `/__pikku/scheduler-job` contract so the same
   * fabric dispatcher path reaches a container target. Status codes match the
   * worker: 204 = ack, 422 = ack-no-retry (missing meta / discarded), 503 =
   * retry (transient/thrown), 401 = bad/missing dispatch secret.
   */
  private async handleDispatchJob(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const expected = this.options.dispatchSecret
    if (expected) {
      const provided = req.headers['x-pikku-dispatch']
      const ok =
        typeof provided === 'string' &&
        provided.length === expected.length &&
        timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
      if (!ok) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end('{"ok":false,"error":"bad dispatch secret"}')
        return
      }
    }

    let body: any
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end('{"ok":false,"error":"invalid json body"}')
      return
    }

    try {
      if (req.url === '/__pikku/scheduler-job') {
        const traceId = `cron-${randomUUID()}`
        await runScheduledTask({ name: body.taskName, traceId })
        res.writeHead(204)
        res.end()
        return
      }

      // queue-job. Resolve the registered queue name (the dispatcher may send a
      // stage-prefixed name) by longest-suffix match against the queue meta.
      const queueMeta = pikkuState(null, 'queue', 'meta') as Record<
        string,
        unknown
      >
      const queueName = queueMeta[body.queueName]
        ? body.queueName
        : (Object.keys(queueMeta)
            .filter((k) => String(body.queueName).endsWith(k))
            .sort((a, b) => b.length - a.length)[0] ?? body.queueName)
      const id = body.jobId ?? body.traceId ?? randomUUID()
      const job: QueueJob = {
        queueName,
        data: body.data,
        id,
        status: async () => 'active' as QueueJobStatus,
        metadata: () => ({
          processedAt: new Date(),
          attemptsMade: 0,
          maxAttempts: undefined,
          result: undefined,
          progress: 0,
          createdAt: new Date(),
          completedAt: undefined,
          failedAt: undefined,
          error: undefined,
        }),
        waitForCompletion: async () => {
          throw new Error('dispatch jobs do not support waitForCompletion')
        },
      }
      await runQueueJob({ job, traceId: body.traceId })
      res.writeHead(204)
      res.end()
    } catch (e: unknown) {
      const errorName = (e as Error)?.name ?? 'Error'
      const message = (e as Error)?.message ?? String(e)
      const noRetry =
        errorName === 'QueueJobDiscardedError' ||
        errorName === 'PikkuMissingMetaError'
      this.logger.error(
        `pikku-node-http-server: dispatch ${req.url} failed — ${errorName}: ${message}`
      )
      res.writeHead(noRetry ? 422 : 503, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, errorName, message }))
    }
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

      if (
        this.options.dispatchJobs &&
        req.method === 'POST' &&
        (req.url === '/__pikku/queue-job' ||
          req.url === '/__pikku/scheduler-job')
      ) {
        await this.handleDispatchJob(req, res)
        return
      }

      if (await this.handleContentRequest(req, res)) {
        return
      }

      if (await this.handleStaticMountRequest(req, res)) {
        return
      }

      if (this.mcpHandler && req.url && this.matchesMcpPath(req.url)) {
        await this.mcpHandler(req, res)
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

  private async handleStaticMountRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<boolean> {
    const mounts = this.config.staticMounts
    if (!mounts?.length || (req.method !== 'GET' && req.method !== 'HEAD')) {
      return false
    }
    const requestUrl = this.getRequestUrl(req)
    if (!requestUrl) {
      return false
    }
    const pathname = decodeURIComponent(requestUrl.pathname)

    for (const mount of mounts) {
      if (!this.matchesPrefix(pathname, mount.urlPrefix)) {
        continue
      }
      const key = this.contentKey(pathname, mount.urlPrefix)
      const served = await this.serveStaticFile(req, res, mount, key)
      if (served) {
        return true
      }
      if (mount.spaFallback) {
        return await this.serveStaticFile(req, res, mount, 'index.html')
      }
      res.writeHead(404)
      res.end()
      return true
    }

    return false
  }

  private async serveStaticFile(
    req: IncomingMessage,
    res: ServerResponse,
    mount: StaticMount,
    key: string
  ): Promise<boolean> {
    const targetPath =
      key === ''
        ? resolve(mount.directory, 'index.html')
        : this.toTargetPath(mount.directory, key)
    if (!targetPath) {
      return false
    }

    let filePath = targetPath
    try {
      let file = await stat(filePath)
      if (file.isDirectory()) {
        filePath = resolve(filePath, 'index.html')
        file = await stat(filePath)
      }
      if (!file.isFile()) {
        return false
      }

      const extension = filePath.slice(filePath.lastIndexOf('.'))
      res.writeHead(200, {
        'content-length': String(file.size),
        'content-type':
          STATIC_MIME_TYPES[extension] ?? 'application/octet-stream',
      })
      if (req.method === 'HEAD') {
        res.end()
        return true
      }
      await new Promise<void>((resolvePromise, reject) => {
        const stream = createReadStream(filePath)
        stream.on('error', reject)
        stream.on('end', () => resolvePromise())
        stream.pipe(res)
      })
      return true
    } catch {
      return false
    }
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
