import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { normalize, resolve } from 'node:path'
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'

import type { CoreConfig } from '@pikku/core/types'
import { stopSingletonServices } from '@pikku/core/utils'
import { installNodeHostResolver } from '@pikku/core/node-host-resolver'
import { pikkuState } from '@pikku/core/state'
import type { LocalContentConfig } from '@pikku/core/services/local-content'
import { signedContentPath } from '@pikku/core/services/local-content'
import type { JWTService, Logger } from '@pikku/core/services'
import { fetchData, PikkuFetchHTTPResponse } from '@pikku/core/http'
import {
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
   * hostname — so `dispatchSecret` is required for these routes to serve
   * anyone at all. Without it every dispatch request is rejected.
   */
  dispatchJobs?: boolean
  /**
   * Shared secret required in the `x-pikku-dispatch` header on the dispatch
   * routes (when `dispatchJobs` is on). The dispatcher attaches it; public
   * callers don't have it. When unset, the routes reject every caller and a
   * warning is logged at startup — the same fail-closed contract the
   * cloudflare runtime's `PIKKU_DISPATCH_SECRET` already has.
   */
  dispatchSecret?: string
  /**
   * The JWTService that signed the content service's URLs. Signed asset reads
   * are verified with it, so it must be the very same service `LocalContent`
   * was constructed with. When unset, `singletonServices.jwt` is used — the
   * usual case, where an app hands one JWTService to both. When neither is
   * available, signed asset reads are rejected: an unverifiable signature is
   * never trusted.
   */
  contentSigningJWT?: JWTService
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
  private loggedMissingContentSigningJWT = false
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
    installNodeHostResolver()
    compileAllSchemas(this.logger)
    if (this.options.configureServer) {
      await this.options.configureServer(this.server)
    }
    logRegisterRoutes(this.logger)
    if (this.options.dispatchJobs && !this.options.dispatchSecret) {
      this.logger.warn(
        'pikku-node-http-server: dispatch routes (/__pikku/queue-job, /__pikku/scheduler-job) are mounted WITHOUT a dispatchSecret — every dispatch request will be rejected. Set dispatchSecret to the value the dispatcher sends in the x-pikku-dispatch header.'
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
   * Fails closed: an unset `dispatchSecret` rejects every caller, matching
   * `@pikku/cloudflare`'s `isDispatchAuthorized`. The comparison runs over
   * HMACs taken under a key generated freshly per call, so the digests that
   * actually get compared are fixed-width and unpredictable — that leaks
   * neither the secret's bytes nor its length, which a length check before
   * `timingSafeEqual` would.
   */
  private isDispatchAuthorized(req: IncomingMessage): boolean {
    const expected = this.options.dispatchSecret
    if (!expected) {
      return false
    }
    const provided = req.headers['x-pikku-dispatch']
    if (typeof provided !== 'string') {
      return false
    }
    const key = randomBytes(32)
    return timingSafeEqual(
      createHmac('sha256', key).update(provided).digest(),
      createHmac('sha256', key).update(expected).digest()
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
    if (!this.isDispatchAuthorized(req)) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end('{"ok":false,"error":"unauthorized"}')
      return
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

      if (await this.handleStaticFileRequest(req, res)) {
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
      if (response.status === 404 && (await this.serveSpaFallback(req, res))) {
        return
      }
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
      await this.handleContentUpload(req, res, content, requestUrl, pathname)
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

  /**
   * Resolve the mounts a GET/HEAD request could be served from, or null when
   * static serving does not apply to this request at all.
   */
  private staticMountCandidates(
    req: IncomingMessage
  ): { pathname: string; mounts: StaticMount[] } | null {
    const mounts = this.config.staticMounts
    if (!mounts?.length || (req.method !== 'GET' && req.method !== 'HEAD')) {
      return null
    }
    const requestUrl = this.getRequestUrl(req)
    if (!requestUrl) {
      return null
    }
    const pathname = decodeURIComponent(requestUrl.pathname)
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
  private async handleStaticFileRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<boolean> {
    const candidates = this.staticMountCandidates(req)
    if (!candidates) {
      return false
    }

    for (const mount of candidates.mounts) {
      const key = this.contentKey(candidates.pathname, mount.urlPrefix)
      const result = await this.serveStaticFile(req, res, mount, key)
      if (result === 'served') {
        return true
      }
      if (result === 'rejected') {
        // A key that escaped the mount directory is refused outright rather
        // than falling through, which would answer a traversal attempt with a
        // 200 and the app shell.
        res.writeHead(404)
        res.end()
        return true
      }
    }

    return false
  }

  /**
   * Last resort for a client-side route: dispatch has already 404'd, so an
   * unmatched path under a `spaFallback` mount is the SPA's own routing.
   */
  private async serveSpaFallback(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<boolean> {
    const candidates = this.staticMountCandidates(req)
    if (!candidates) {
      return false
    }

    for (const mount of candidates.mounts) {
      if (!mount.spaFallback) {
        continue
      }
      const result = await this.serveStaticFile(req, res, mount, 'index.html')
      if (result === 'served') {
        return true
      }
    }

    return false
  }

  /**
   * `rejected` is kept distinct from `missing` because the two must not share a
   * fate: a missing file is a candidate for the SPA fallback, while a key that
   * resolved outside the mount directory must never be. An `assets` mount never
   * produces `rejected` at all — a map lookup has no directory to escape.
   */
  private async serveStaticFile(
    req: IncomingMessage,
    res: ServerResponse,
    mount: StaticMount,
    key: string
  ): Promise<'served' | 'missing' | 'rejected'> {
    const contentKey = key === '' ? 'index.html' : key

    if (mount.assets && !(contentKey in mount.assets)) {
      return 'missing'
    }

    const targetPath = mount.assets
      ? mount.assets[contentKey]!
      : key === ''
        ? resolve(mount.directory, 'index.html')
        : this.toTargetPath(mount.directory, key)
    if (!targetPath) {
      return 'rejected'
    }

    let filePath = targetPath
    try {
      let file = await stat(filePath)
      if (file.isDirectory()) {
        filePath = resolve(filePath, 'index.html')
        file = await stat(filePath)
      }
      if (!file.isFile()) {
        return 'missing'
      }

      // An embedded asset's stored name is opaque, so the type comes from the
      // key the client actually asked for.
      const typedPath = mount.assets ? contentKey : filePath
      const extension = typedPath.slice(typedPath.lastIndexOf('.'))
      res.writeHead(200, {
        'content-length': String(file.size),
        'content-type':
          STATIC_MIME_TYPES[extension] ?? 'application/octet-stream',
      })
      if (req.method === 'HEAD') {
        res.end()
        return 'served'
      }
      await new Promise<void>((resolvePromise, reject) => {
        const stream = createReadStream(filePath)
        stream.on('error', reject)
        stream.on('end', () => resolvePromise())
        stream.pipe(res)
      })
      return 'served'
    } catch {
      return 'missing'
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
    // A root mount covers the whole tree; the generic test below would match
    // only `/` itself, since nothing starts with `//`.
    if (prefix === '' || prefix === '/') {
      return true
    }
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
    requestUrl: URL,
    pathname: string
  ): Promise<void> {
    // Presigned like a read: refuse an upload that is not signed, or an
    // unauthenticated PUT could write arbitrary bytes anywhere under the
    // content root. The read path here has always verified; the write path did
    // not.
    const signedUpload = await this.validateSignedAssetRequest(requestUrl)
    if (!signedUpload.ok) {
      res.writeHead(signedUpload.status, {
        'content-type': 'text/plain; charset=utf-8',
      })
      res.end(signedUpload.body)
      return
    }

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

    const jwt = this.getContentSigningJWTService()
    if (!jwt) {
      // Logged once: an unverifiable request is attacker-triggerable, and the
      // condition it reports is a startup misconfiguration, not per-request news.
      if (!this.loggedMissingContentSigningJWT) {
        this.loggedMissingContentSigningJWT = true
        this.logger.error(
          'pikku-node-http-server: refusing signed asset reads — no JWTService is available to verify them. Pass `contentSigningJWT` (the same service LocalContent signs with) or expose it as `singletonServices.jwt`.'
        )
      }
      return {
        ok: false,
        status: 403,
        body: 'Invalid signed URL',
      }
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
        path?: string
      }>(signature)

      if (
        payload.signedAt !== signedAt ||
        payload.expiresAt !== expiresAt ||
        payload.notBefore !== notBefore ||
        payload.path !== signedContentPath(requestUrl.pathname)
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

  private getContentSigningJWTService(): JWTService | undefined {
    return (
      this.options.contentSigningJWT ??
      pikkuState(null, 'package', 'singletonServices')?.jwt
    )
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
          `pikku-node-http-server: listening on http://${this.config.hostname}:${this.port}`
        )
        resolve()
      })
    })
  }

  /**
   * The port the server is actually listening on.
   *
   * Not the same as `config.port` whenever that is `0`: the OS picks a free
   * port at bind time, and a parent process that was told `0` has no other way
   * to find out which one. Falls back to the requested port before `start()`.
   */
  public get port(): number {
    const address = this.server.address()
    if (address && typeof address === 'object') {
      return address.port
    }
    return this.config.port
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
