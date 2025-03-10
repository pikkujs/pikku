import { Server } from 'http'
import { WebSocket, WebSocketServer } from 'ws'
import { logChannels } from '@pikku/core/channel'
import {
  LocalEventHubService,
  runLocalChannel,
  PikkuLocalChannelHandler,
} from '@pikku/core/channel/local'
import { compileAllSchemas } from '@pikku/core/schema'
import { RunRouteOptions } from '@pikku/core/http'
import { CoreSingletonServices, CreateSessionServices } from '@pikku/core'

import { PikkuHTTPRequest } from './pikku-http-request.js'
import { PikkuDuplexResponse } from './pikku-duplex-response.js'
import crypto from 'crypto'

/**
 * Options for configuring the `pikkuHandler`.
 *
 * @typedef {Object} PikkuuWSHandlerOptions
 * @property {CoreSingletonServices} singletonServices - The singleton services used by the handler.
 * @property {CreateSessionServices<any, any, any>} createSessionServices - A function to create session services.
 * @property {boolean} [logRoutes] - Whether to log the routes.
 * @property {boolean} [loadSchemas] - Whether to load all schemas.
 * @property {RunRouteOptions} - Additional options for running the route.
 */
export type PikkuWSHandlerOptions = {
  server: Server
  wss: WebSocketServer
  singletonServices: CoreSingletonServices
  createSessionServices?: CreateSessionServices<any, any, any>
  logRoutes?: boolean
  loadSchemas?: boolean
} & RunRouteOptions

const isSerializable = (data: any): boolean => {
  // Check if the data is any kind of Buffer-like object
  if (
    typeof data === 'string' ||
    data instanceof ArrayBuffer ||
    data instanceof Uint8Array ||
    data instanceof Int8Array ||
    data instanceof Uint16Array ||
    data instanceof Int16Array ||
    data instanceof Uint32Array ||
    data instanceof Int32Array ||
    data instanceof Float32Array ||
    data instanceof Float64Array ||
    data instanceof DataView ||
    data instanceof SharedArrayBuffer ||
    (Array.isArray(data) && data.some((item) => item instanceof Buffer))
  ) {
    return false // Not serializable (binary or buffer-like)
  }

  // Allow primitive objects and objects that are not binary-like
  return true
}

/**
 * Creates a WebSocket handler for handling requests using the `@pikku/core` framework.
 *
 * @param {PikkuuWSHandlerOptions} options - The options to configure the handler.
 * @returns {Function} - The WebSocket request handler function.
 */
export const pikkuWebsocketHandler = ({
  server,
  wss,
  singletonServices,
  createSessionServices,
  loadSchemas,
  logRoutes,
}: PikkuWSHandlerOptions) => {
  if (logRoutes) {
    logChannels(singletonServices.logger)
  }
  if (loadSchemas) {
    compileAllSchemas(singletonServices.logger)
  }

  const eventHub = new LocalEventHubService()
  const singletonServicesWithEventHub = {
    ...singletonServices,
    eventHub,
  }

  wss.on(
    'connection',
    (ws: WebSocket, channelHandler: PikkuLocalChannelHandler) => {
      eventHub.onChannelOpened(channelHandler)

      channelHandler.registerOnSend((data) => {
        if (isSerializable(data)) {
          ws.send(JSON.stringify(data))
        } else {
          ws.send(data as any)
        }
      })

      ws.on('message', async (message, isBinary) => {
        let result
        if (isBinary) {
          result = await channelHandler.message(message)
        } else {
          result = await channelHandler.message(message.toString())
        }
        if (result) {
          // TODO: We don't support binary results as returns just yet
          channelHandler.send(JSON.stringify(result))
        }
      })

      ws.on('close', () => {
        eventHub.onChannelClosed(channelHandler.channelId)
        channelHandler.close()
      })

      channelHandler.open()
    }
  )

  server.on('upgrade', async (req, socket, head) => {
    // Handle WebSocket connection upgrade
    const request = new PikkuHTTPRequest(req)
    const response = new PikkuDuplexResponse(socket)

    // Initialize the channel handler
    const channelHandler = await runLocalChannel({
      channelId: crypto.randomUUID().toString(),
      request,
      response,
      singletonServices: singletonServicesWithEventHub,
      createSessionServices: createSessionServices as any,
      route: request.path,
    })

    if (!channelHandler) {
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, channelHandler)
    })
  })
}
