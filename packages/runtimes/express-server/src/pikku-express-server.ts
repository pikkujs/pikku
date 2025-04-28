import express from 'express'
import core from 'express-serve-static-core'
import { Server } from 'http'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { CorsOptions, CorsOptionsDelegate } from 'cors'

import {
  CoreConfig,
  CoreSingletonServices,
  CreateSessionServices,
} from '@pikku/core'
import { pikkuExpressMiddleware } from '@pikku/express-middleware'

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
}

export class PikkuExpressServer {
  public app: core.Express = express()
  private server: Server | undefined

  constructor(
    private readonly config: ExpressCoreConfig,
    private readonly singletonServices: CoreSingletonServices,
    private readonly createSessionServices: CreateSessionServices<any, any, any>
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

  public enableStaticAssets(assetsUrl: string, contentDirectory: string) {
    this.app.use(assetsUrl || '/assets/', express.static(contentDirectory))
  }

  public async init() {
    this.app.use(
      express.json({
        limit: this.config.limits?.json || '1mb',
      }),
      express.text({
        limit: this.config.limits?.xml || '1mb',
        type: 'text/xml',
      }),
      express.urlencoded({
        extended: true,
        limit: this.config.limits?.urlencoded || '1mb',
      }),
      cookieParser(),
      pikkuExpressMiddleware(
        this.singletonServices,
        this.createSessionServices,
        {
          logRoutes: true,
          loadSchemas: true,
        }
      )
    )
  }

  public async start() {
    return await new Promise<void>((resolve) => {
      this.server = this.app.listen(
        this.config.port,
        this.config.hostname,
        () => {
          this.singletonServices.logger.info(
            `listening on port ${this.config.port} and host: ${this.config.hostname}`
          )
          resolve()
        }
      )
    })
  }

  public async stop(): Promise<void> {
    return await new Promise<void>(async (resolve) => {
      if (this.server == null) {
        throw 'Unable to stop server as it hasn`t been correctly started'
      }
      this.server.close(() => {
        resolve()
      })
    })
  }

  public async enableExitOnSigInt() {
    process.removeAllListeners('SIGINT').on('SIGINT', async () => {
      this.singletonServices.logger.info('Stopping server...')
      for (const [name, service] of Object.entries(this.singletonServices)) {
        const stop = (service as any).stop
        if (stop) {
          this.singletonServices.logger.info(
            `Stopping singleton service ${name}`
          )
          await stop()
        }
      }
      await this.stop()
      this.singletonServices.logger.info('Server stopped')
      process.exit(0)
    })
  }
}
