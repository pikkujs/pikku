import * as uWS from 'uWebSockets.js'

import type {
  CoreConfig,
  CoreSingletonServices,
  CreateInteractionServices,
} from '@pikku/core'

import { pikkuHTTPHandler, pikkuWebsocketHandler } from '@pikku/uws-handler'

export type UWSCoreConfig = CoreConfig & {
  /** The port on which the server should listen. */
  port: number
  /** The hostname for the server. */
  hostname: string
  /** The path for health checks (optional). */
  healthCheckPath?: string
}

/**
 * Class representing a uWebSockets.js-based server for Pikku.
 * This class is intended for quickly creating a uWebSockets server with the pikku handler, useful for prototyping.
 * For production systems, it is expected that the uWS handler will be used directly or this file will be used as a template to add extra handlers (e.g., CORS).
 */
export class PikkuUWSServer {
  /** The uWebSockets app instance */
  public app = uWS.App()
  /** The socket used for listening, or null if not listening */
  private listenSocket: boolean | uWS.us_listen_socket | null = null

  /**
   * Constructs a new PikkuUWSServer.
   *
   * @param config - The configuration for the server.
   * @param singletonServices - The singleton services used by the server.
   * @param createInteractionServices - Function to create interaction services for each request.
   */
  constructor(
    private readonly config: UWSCoreConfig,
    private readonly singletonServices: CoreSingletonServices,
    private readonly createInteractionServices: CreateInteractionServices<
      any,
      any,
      any
    >
  ) {}

  /**
   * Initializes the server by setting up health check and request handling routes.
   */
  public async init() {
    this.app.get(
      this.config.healthCheckPath || '/health-check',
      async (res) => {
        res.writeStatus('200').end()
      }
    )

    this.app.any(
      '/*',
      pikkuHTTPHandler({
        logRoutes: true,
        singletonServices: this.singletonServices,
        createInteractionServices: this.createInteractionServices,
      })
    )

    this.app.ws(
      '/*',
      pikkuWebsocketHandler({
        logRoutes: true,
        singletonServices: this.singletonServices,
        createInteractionServices: this.createInteractionServices,
      })
    )
  }

  /**
   * Starts the server and begins listening on the configured hostname and port.
   *
   * @returns A promise that resolves when the server has started.
   */
  public async start() {
    return await new Promise<void>((resolve) => {
      this.app.listen(this.config.hostname, this.config.port, (token) => {
        this.listenSocket = token
        this.singletonServices.logger.info(
          `listening on port ${this.config.port} and host: ${this.config.hostname}`
        )
        resolve()
      })
    })
  }

  /**
   * Stops the server by closing the listening socket.
   *
   * @returns A promise that resolves when the server has stopped.
   * @throws An error if the server was not correctly started.
   */
  public async stop(): Promise<void> {
    return await new Promise<void>((resolve) => {
      if (this.listenSocket == null) {
        throw 'Unable to stop server as it hasn`t been correctly started'
      }
      uWS.us_listen_socket_close(this.listenSocket)
      this.listenSocket = null

      // Wait for 2 seconds to allow all connections to close
      setTimeout(resolve, 2000)
    })
  }

  /**
   * Enables the server to exit gracefully when a SIGINT signal is received.
   */
  public async enableExitOnSigInt() {
    process.removeAllListeners('SIGINT').on('SIGINT', async () => {
      this.singletonServices.logger.info('Stopping server...')
      await this.stop()
      this.singletonServices.logger.info('Server stopped')
      process.exit(0)
    })
  }
}
