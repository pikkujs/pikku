import type { Express } from 'express'
import express from 'express'
import type { Server } from 'http'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import type { CorsOptions, CorsOptionsDelegate } from 'cors'
import getRawBody from 'raw-body'
import contentType from 'content-type'
import { mkdir, writeFile } from 'fs/promises'
import { resolve, normalize } from 'path'

import type { CoreConfig } from '@pikku/core'
import { stopSingletonServices } from '@pikku/core'
import { installNodeHostResolver } from '@pikku/core/ecosystem/node-host-resolver'
import { pikkuState } from '@pikku/core/ecosystem'
import type { JWTService, Logger } from '@pikku/core/services'
import type { RunHTTPWiringOptions } from '@pikku/core/ecosystem/http'
import { pikkuExpressMiddleware } from '@pikku/express-middleware'
import type { LocalContentConfig } from '@pikku/core/services/local-content'
import { verifySignedContentRequest } from '@pikku/core/ecosystem/services/local-content-request-handler'

/**
 * Interface for server-specific configuration settings that extend `CoreConfig`.
 */
export type ExpressCoreConfig = CoreConfig & {
  /** The port on which the server should listen. */
  port: number
  /** The hostname for the server. */
  hostname: string
  /** The path for health checks (optional). */
  healthCheckPath?: string
  /** Limits for the server, e.g., memory or request limits (optional). */
  limits?: Partial<Record<string, string>>
  /** Content */
  content?: LocalContentConfig
}

export class PikkuExpressServer {
  public app: Express = express()
  private server: Server | undefined

  constructor(
    private readonly config: ExpressCoreConfig,
    private readonly logger: Logger
  ) {
    this.app.get(
      this.config.healthCheckPath || '/health-check',
      function (req, res) {
        res.status(200).json({ status: 'ok' })
      }
    )
  }

  public enableCors(options: CorsOptions | CorsOptionsDelegate) {
    this.app.use(cors(options))
  }

  /**
   * The content JWT LocalContent signs URLs with. Read from singleton services
   * at request time — the express adapter is constructed with only config and a
   * logger, so it has no other handle on it. A missing service means signed
   * requests cannot be verified and are refused, never trusted.
   */
  private getContentSigningJWT(): JWTService | undefined {
    return pikkuState(null, 'package', 'singletonServices')?.jwt
  }

  public enableStaticAssets() {
    const configContent = this.config.content
    if (!configContent) {
      throw new Error(
        'Content config is not set, needed to enable asset serving'
      )
    }
    const basePath = resolve(configContent.localFileUploadPath)

    // Not express.static: that serves the upload directory to anyone, bypassing
    // the signed-URL check every other read of this content goes through.
    // Verify the signature first, then serve.
    this.app.get(`${configContent.assetUrlPrefix}/*path`, async (req, res) => {
      const requestUrl = new URL(req.originalUrl, 'http://localhost')
      const signed = await verifySignedContentRequest(
        requestUrl,
        this.getContentSigningJWT()
      )
      if (!signed.ok) {
        res.status(signed.status).end(signed.body)
        return
      }

      const key = (req.params as any).path.join('/')
      const targetPath = resolve(basePath, normalize(key))
      if (!targetPath.startsWith(basePath + '/')) {
        res.status(400).end('Invalid path')
        return
      }
      res.sendFile(targetPath, (err) => {
        if (err && !res.headersSent) res.status(404).end()
      })
    })
  }

  public enableReaper() {
    const configContent = this.config.content
    if (!configContent) {
      throw new Error(
        'Content config is not set, needed to enable file uploads'
      )
    }

    const basePath = resolve(configContent.localFileUploadPath)

    this.app.put('/reaper/*path', async (req, res) => {
      // Presigned like a read: an unsigned PUT could write arbitrary bytes
      // anywhere under the content root. Verify before touching disk.
      const requestUrl = new URL(req.originalUrl, 'http://localhost')
      const signed = await verifySignedContentRequest(
        requestUrl,
        this.getContentSigningJWT()
      )
      if (!signed.ok) {
        res.status(signed.status).end(signed.body)
        return
      }

      const key = (req.params as any).path.join('/')
      const targetPath = resolve(basePath, normalize(key))
      if (!targetPath.startsWith(basePath + '/')) {
        res.status(400).end('Invalid path')
        return
      }

      const file = await getRawBody(req, {
        length: req.headers['content-length'],
        limit: configContent.sizeLimit || '1mb',
        encoding: contentType.parse(req).parameters.charset,
      })

      const dir = targetPath.substring(0, targetPath.lastIndexOf('/'))
      await mkdir(dir, { recursive: true })
      await writeFile(targetPath, file, 'binary')
      res.end()
    })
  }

  public async init(httpOptions: RunHTTPWiringOptions = {}) {
    installNodeHostResolver()

    // Express buffers the body before Pikku ever sees it, so the parser limit
    // is the only place an oversized request can be stopped. Pikku's
    // `maxBodySize` therefore feeds express's own limit, with an explicit
    // per-parser `limits` entry still winning.
    const { maxBodySize } = httpOptions
    this.app.use(
      express.json({
        limit: this.config.limits?.json || maxBodySize || '1mb',
      })
    )
    this.app.use(
      express.text({
        limit: this.config.limits?.xml || maxBodySize || '1mb',
        type: 'text/xml',
      })
    )
    this.app.use(
      express.urlencoded({
        extended: true,
        limit: this.config.limits?.urlencoded || maxBodySize || '1mb',
      })
    )
    this.app.use(cookieParser())
    this.app.use(
      pikkuExpressMiddleware({
        logger: this.logger,
        logRoutes: true,
        loadSchemas: true,
        ...httpOptions,
      })
    )
  }

  public async start() {
    return await new Promise<void>((resolve) => {
      this.server = this.app.listen(
        this.config.port,
        this.config.hostname,
        () => {
          this.logger.info(
            `listening on port ${this.config.port} and host: ${this.config.hostname}`
          )
          resolve()
        }
      )
    })
  }

  public getHttpServer(): Server {
    if (!this.server) {
      throw new Error('Server has not been started yet')
    }
    return this.server
  }

  public async stop(): Promise<void> {
    if (this.server == null) {
      throw new Error(
        'Unable to stop server as it hasn`t been correctly started'
      )
    }
    return await new Promise<void>((resolve) => {
      this.server!.close(() => {
        resolve()
      })
    })
  }

  public async enableExitOnSigInt() {
    process.on('SIGINT', async () => {
      this.logger.info('Stopping server...')
      await stopSingletonServices()
      await this.stop()
      this.logger.info('Server stopped')
      process.exit(0)
    })
  }
}
