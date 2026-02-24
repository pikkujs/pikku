import { Server } from 'http'
import { WebSocket, WebSocketServer } from 'ws'
import { logChannels } from '@pikku/core/channel'
import {
  LocalEventHubService,
  runLocalChannel,
  PikkuLocalChannelHandler,
} from '@pikku/core/channel/local'
import { compileAllSchemas } from '@pikku/core/schema'
import { PikkuFetchHTTPRequest, RunHTTPWiringOptions } from '@pikku/core/http'
import type { Logger } from '@pikku/core/services'

import { PikkuDuplexResponse } from './pikku-duplex-response.js'
import crypto from 'crypto'
import { incomingMessageToRequestConvertor } from './incoming-message-to-request-convertor.js'

/**
 * Options for configuring the `pikkuHandler`.
 */
export type PikkuWSHandlerOptions = {
  server: Server
  wss: WebSocketServer
  logger?: Logger
  logRoutes?: boolean
  loadSchemas?: boolean
} & RunHTTPWiringOptions

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
 * @param options - The options to configure the handler.
 * @returns The WebSocket request handler function.
 */
export const pikkuWebsocketHandler = ({
  server,
  wss,
  logger,
  loadSchemas,
  logRoutes,
}: PikkuWSHandlerOptions) => {
  if (logRoutes && logger) {
    logChannels(logger)
  }
  if (loadSchemas && logger) {
    compileAllSchemas(logger)
  }

  const eventHub = new LocalEventHubService()

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
    const request = new PikkuFetchHTTPRequest(
      incomingMessageToRequestConvertor(req)
    )
    const response = new PikkuDuplexResponse(socket)

    // Initialize the channel handler
    const channelHandler = await runLocalChannel({
      channelId: crypto.randomUUID().toString(),
      request,
      response,
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
