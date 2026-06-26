import type { Server as BunServer, ServerWebSocket } from 'bun'

import type { CoreConfig } from '@pikku/core'
import { stopSingletonServices } from '@pikku/core'
import type { Logger } from '@pikku/core/services'
import {
  fetchData,
  PikkuFetchHTTPRequest,
  PikkuFetchHTTPResponse,
  logRoutes as logRegisterRoutes,
  type RunHTTPWiringOptions,
} from '@pikku/core/http'
import { logChannels } from '@pikku/core/channel'
import type { PikkuLocalChannelHandler } from '@pikku/core/channel/local'
import { runLocalChannel } from '@pikku/core/channel/local'
import { compileAllSchemas } from '@pikku/core/schema'

import { BunEventHubService } from './bun-event-hub-service.js'

export type BunServerConfig = CoreConfig & {
  port: number
  hostname?: string
  healthCheckPath?: string
}

export type PikkuBunServerOptions = RunHTTPWiringOptions

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
export class PikkuBunServer {
  private server: BunServer<WsData> | null = null
  private readonly eventHub = new BunEventHubService()

  constructor(
    private readonly config: BunServerConfig,
    private readonly logger: Logger,
    private readonly options: PikkuBunServerOptions = {}
  ) {}

  public async init(): Promise<void> {
    compileAllSchemas(this.logger)
    logRegisterRoutes(this.logger)
    logChannels(this.logger)
  }

  public async start(): Promise<void> {
    const { config, logger, options, eventHub } = this

    this.server = Bun.serve<WsData>({
      port: config.port,
      hostname: config.hostname,

      fetch: async (req, server) => {
        if (req.headers.get('upgrade') === 'websocket') {
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

        const pikkuReq = new PikkuFetchHTTPRequest(req)
        const pikkuRes = new PikkuFetchHTTPResponse()
        await fetchData(pikkuReq, pikkuRes, {
          respondWith404: true,
          ...options,
        })
        return pikkuRes.toResponse()
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
          eventHub.onChannelOpened(channelHandler.channelId, ws)
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
      `pikku-bun-server: listening on http://${config.hostname ?? 'localhost'}:${config.port}`
    )
  }

  public async stop(): Promise<void> {
    await this.server?.stop()
    this.server = null
  }

  public enableExitOnSignals(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`pikku-bun-server: ${signal} received, stopping`)
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
