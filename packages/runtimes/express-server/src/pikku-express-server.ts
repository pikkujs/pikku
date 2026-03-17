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
import type { Logger } from '@pikku/core/services'
import type { RunHTTPWiringOptions } from '@pikku/core/http'
import { pikkuExpressMiddleware } from '@pikku/express-middleware'
import type { LocalContentConfig } from '@pikku/core/services/local-content'

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

  public enableStaticAssets() {
    const configContent = this.config.content
    if (!configContent) {
      throw new Error(
        'Content config is not set, needed to enable asset serving'
      )
    }
    this.app.use(
      configContent.assetUrlPrefix,
      express.static(configContent.localFileUploadPath)
    )
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
    this.app.use(
      express.json({
        limit: this.config.limits?.json || '1mb',
      })
    )
    this.app.use(
      express.text({
        limit: this.config.limits?.xml || '1mb',
        type: 'text/xml',
      })
    )
    this.app.use(
      express.urlencoded({
        extended: true,
        limit: this.config.limits?.urlencoded || '1mb',
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
    process.removeAllListeners('SIGINT').on('SIGINT', async () => {
      this.logger.info('Stopping server...')
      await stopSingletonServices()
      await this.stop()
      this.logger.info('Server stopped')
      process.exit(0)
    })
  }
}
