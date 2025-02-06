import Fastify from 'fastify'

import {
  CoreConfig,
  CoreSingletonServices,
  CreateSessionServices,
} from '@vramework/core'
import vrameworkFastifyPlugin from '@vramework/fastify-plugin'

export type FastifyCoreConfig = CoreConfig & {
  /** The port on which the server should listen. */
  port: number
  /** The hostname for the server. */
  hostname: string
  /** The path for health checks (optional). */
  healthCheckPath?: string
}

/**
 * The `VrameworkFastifyServer` class provides a Fastify server integrated with the Vramework framework.
 * This class helps in quickly setting up a Fastify server with Vramework's core features, including health checks,
 * route handling, and integration with singleton and session services.
 */
export class VrameworkFastifyServer {
  /** The Fastify app instance */
  public app = Fastify({})

  /**
   * Constructs a new instance of the `VrameworkFastifyServer` class.
   *
   * @param config - The configuration for the server.
   * @param singletonServices - The singleton services used by the server.
   * @param createSessionServices - Function to create session services for each request.
   */
  constructor(
    private readonly config: FastifyCoreConfig,
    private readonly singletonServices: CoreSingletonServices,
    private readonly createSessionServices: CreateSessionServices<any, any, any>
  ) {}

  /**
   * Placeholder for enabling CORS.
   *
   * @param _options - The options to configure CORS.
   * @throws Method not implemented.
   */
  public enableCors(_options: any) {
    throw new Error('Method not implemented.')
  }

  /**
   * Initializes the server by setting up health check and registering the Vramework Fastify plugin.
   */
  public async init() {
    this.app.get(this.config.healthCheckPath || '/health-check', async () => {
      return { status: 'ok' }
    })

    this.app.register(vrameworkFastifyPlugin, {
      vramework: {
        singletonServices: this.singletonServices,
        createSessionServices: this.createSessionServices,
        respondWith404: true,
        logRoutes: true,
        loadSchemas: true,
      },
    })
  }

  /**
   * Starts the server and begins listening on the configured hostname and port.
   */
  public async start() {
    await this.app.listen({
      port: this.config.port,
      host: this.config.hostname,
    })
    this.singletonServices.logger.info(
      `listening on port ${this.config.port} and host: ${this.config.hostname}`
    )
  }

  /**
   * Stops the server and closes all connections.
   */
  public async stop(): Promise<void> {
    this.singletonServices.logger.info('Stopping server...')
    await this.app.close()
    this.singletonServices.logger.info('Server stopped')
  }

  /**
   * Enables the server to exit gracefully when a SIGINT signal is received.
   */
  public async enableExitOnSigInt() {
    process.removeAllListeners('SIGINT').on('SIGINT', async () => {
      await this.stop()
      process.exit(0)
    })
  }
}
